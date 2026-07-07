import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function fmtDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { hour12: false });
  } catch (_) { return iso; }
}

export function fmtDuration(sec) {
  if (!sec && sec !== 0) return "-";
  const s = Math.max(0, sec | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export function apiErrToStr(detail) {
  if (detail == null) return "Erro desconhecido";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" | ");
  }
  if (typeof detail === "object" && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
