"""Minimal async FreeSWITCH ESL (Event Socket) client.

Implements just the subset needed by SBC Manager:
- Inbound TCP connection to freeswitch event socket
- Auth with password
- Send `api` and `bgapi` commands
- Read response bodies

Docs: https://developer.signalwire.com/freeswitch/FreeSWITCH-Explained/Client-and-Developer-Interfaces/Event-Socket-Library/
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional, Dict

logger = logging.getLogger("sbc.esl")


class ESLClient:
    def __init__(self, host: str, port: int, password: str, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.password = password
        self.timeout = timeout
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.connected = False
        self._lock = asyncio.Lock()

    async def connect(self) -> bool:
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port), timeout=self.timeout
            )
            # First event is auth/request
            evt = await self._read_event()
            if evt.get("Content-Type", "").strip() != "auth/request":
                logger.warning("ESL unexpected first event: %s", evt)
                await self.close()
                return False
            self.writer.write(f"auth {self.password}\n\n".encode())
            await self.writer.drain()
            reply = await self._read_event()
            if reply.get("Reply-Text", "").startswith("+OK"):
                self.connected = True
                logger.info("ESL connected to %s:%s", self.host, self.port)
                return True
            logger.warning("ESL auth failed: %s", reply.get("Reply-Text"))
            await self.close()
            return False
        except Exception as e:
            logger.warning("ESL connect failed: %s", e)
            await self.close()
            return False

    async def _read_event(self) -> Dict[str, str]:
        assert self.reader is not None
        headers: Dict[str, str] = {}
        while True:
            line = await asyncio.wait_for(self.reader.readline(), timeout=self.timeout)
            if not line:
                raise ConnectionError("ESL connection closed")
            s = line.decode(errors="replace").rstrip("\r\n")
            if s == "":
                break
            if ":" in s:
                k, v = s.split(":", 1)
                headers[k.strip()] = v.strip()
        cl = int(headers.get("Content-Length", "0"))
        if cl > 0:
            body = await asyncio.wait_for(self.reader.readexactly(cl), timeout=self.timeout)
            headers["_body"] = body.decode(errors="replace")
        return headers

    async def api(self, command: str) -> str:
        async with self._lock:
            if not self.connected:
                if not await self.connect():
                    return ""
            try:
                assert self.writer is not None
                self.writer.write(f"api {command}\n\n".encode())
                await self.writer.drain()
                evt = await self._read_event()
                return evt.get("_body", "").strip()
            except Exception as e:
                logger.warning("ESL api error: %s", e)
                await self.close()
                return ""

    async def bgapi(self, command: str) -> None:
        async with self._lock:
            if not self.connected:
                if not await self.connect():
                    return
            try:
                assert self.writer is not None
                self.writer.write(f"bgapi {command}\n\n".encode())
                await self.writer.drain()
                await self._read_event()
            except Exception as e:
                logger.warning("ESL bgapi error: %s", e)
                await self.close()

    async def close(self) -> None:
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
        self.reader = None
        self.writer = None
        self.connected = False
