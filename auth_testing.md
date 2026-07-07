# SBC Manager - Auth Testing Playbook

## Credentials
- Admin email: `admin@sbcmanager.com`
- Admin password: `Admin@2026`
- Backend URL (external): from `frontend/.env` `REACT_APP_BACKEND_URL`
- API prefix: `/api`

## Endpoints
- POST `/api/auth/login`  { email, password } -> sets httpOnly cookies + returns user
- GET  `/api/auth/me`      requires cookie -> returns current user
- POST `/api/auth/logout`  requires cookie -> clears cookies
- POST `/api/auth/refresh` requires refresh cookie -> new access cookie

## Curl tests
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -c cookies.txt -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@sbcmanager.com","password":"Admin@2026"}'
curl -b cookies.txt "$API/api/auth/me"
```

## Mongo verification
```
mongosh
use sbc_manager
db.users.findOne({role: "admin"})
```
Password hash must start with `$2b$`.
