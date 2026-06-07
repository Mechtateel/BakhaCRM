# AUTH & RBAC PLAN — Bakha CRM

## 1. Auth State Audit (pre-implementation)

### What existed before this phase

| Area | Finding |
|---|---|
| Login page | `/login` with email + password form — present |
| Auth check | `localStorage.getItem("bakha_token")` — client-side only gate |
| Token format | `base64url(id:email)` — NOT cryptographically secure |
| Password hashing | SHA-256 — weak (no salt) |
| Session storage | None — no server-side sessions |
| API protection | Zero auth middleware on any route |
| RBAC enforcement | None — roles existed in DB but were never checked |
| Current user tracking | Hardcoded `responsibleId: null` on most mutations |
| Cookie usage | None |

### What was hardcoded / missing

- All 20+ API endpoints were fully open — no token required
- `localStorage.getItem("bakha_token")` was set but **never validated** server-side
- `bakha_user` in localStorage held role for display only, not enforced
- No logout endpoint — only `localStorage.removeItem("bakha_token")`
- No session expiry or revocation mechanism

---

## 2. Database Changes

### New table: `sessions`

Created via `ensureAuthSchema()` at server startup (idempotent):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw session token
  expires_at TEXT NOT NULL,           -- ISO timestamp
  revoked_at TEXT,                    -- NULL = active
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Session TTL: **7 days**. Revocation on logout or password reset.

### Modified: `users`

Added `last_login_at TEXT` column (via `ALTER TABLE IF NOT EXISTS` pattern).

Added `owner` role to the roles table (seed updated).

---

## 3. Roles and Permissions

| Role | Code | Access |
|---|---|---|
| Владелец | `owner` | Full — all pages, integrations, system status, user management, import |
| Администратор | `admin` | Full CRM — users, settings, no owner-only system ops |
| Менеджер | `manager` | Leads, tasks, chats, analytics — no integration secrets/system status |
| Замерщик | `measurer` | Measurement pipeline, assigned tasks — limited access |
| Монтажник | `installer` | Installation tasks, status updates — limited access |

### API role enforcement

| Endpoints | Required roles |
|---|---|
| `POST /api/leads` | `owner`, `admin`, `manager` |
| `PATCH /api/leads/:id` | `owner`, `admin`, `manager` |
| `PATCH /api/leads/:id/stage` | `owner`, `admin`, `manager` |
| `POST /api/leads/:id/messages` | `owner`, `admin`, `manager` |
| `POST /api/leads/:id/call` | `owner`, `admin`, `manager` |
| `POST /api/tasks` | `owner`, `admin`, `manager` |
| `PATCH /api/tasks/:id` | `owner`, `admin`, `manager` |
| `POST /api/tasks/:id/complete` | `owner`, `admin`, `manager` |
| `POST /api/tasks/:id/reopen` | `owner`, `admin`, `manager` |
| `POST /api/notes` | `owner`, `admin`, `manager` |
| `GET /api/system/status` | `owner`, `admin` only |
| `POST /api/import/amo/dry-run` | `owner`, `admin` only |
| `POST /api/import/amo/run` | `owner`, `admin` only |
| `POST /api/telephony/mappings` | `owner`, `admin` only |
| `POST /api/users` | `owner`, `admin` only |
| `PATCH /api/users/:id` | `owner`, `admin` only |
| `POST /api/users/:id/set-password` | `owner`, `admin` only |
| `GET /api/bootstrap` | **Open** (read-only, demo-safe) |
| `GET /api/leads/:id` | **Open** (read-only) |
| `GET /api/health` | **Open** |

### Frontend RBAC (UI hiding)

- `Settings` and `Состояние системы` nav items hidden for non-admin/owner roles
- User management actions (create, deactivate, reset password) hidden for non-admin/owner
- Role selector in user table only shown to admin/owner

---

## 4. Authentication Flow

### Login

```
POST /api/auth/login { email, password }

1. Find user by email (case-insensitive)
2. Verify password:
   - If hash starts with $2b$ or $2a$ → bcrypt.compare()
   - Otherwise → SHA-256 (legacy), then auto-upgrade to bcrypt
3. Check user.status === 'active'
4. Generate random 64-char hex session token
5. Store SHA-256(token) in sessions table
6. Set HTTP-only cookie: bakha_session (7 days)
7. Return { token: base64url(id:email), user: { id, name, email, role, roleTitle } }
   - Frontend stores token in localStorage as gate signal
   - Frontend stores user in localStorage for display
```

### Session validation (per request)

```
1. Parse Cookie header → extract bakha_session value
2. SHA-256(rawToken) → look up in sessions table
3. Check revokedAt IS NULL AND expiresAt > now()
4. Join with users + roles → get CurrentUser
5. Check user.status === 'active'
6. Attach CurrentUser to res.locals.currentUser
```

### Logout

```
POST /api/auth/logout

1. Read bakha_session cookie
2. SHA-256(token) → find session → set revokedAt = NOW()
3. Set-Cookie: bakha_session=; Max-Age=0 (clear cookie)
```

### Password upgrade path

Existing SHA-256 hashes are upgraded to bcrypt automatically on first login. No migration needed.

---

## 5. Local Dev Credentials

> ⚠️ These credentials are for **local development only**. Do not use in production.

| User | Email | Password | Role |
|---|---|---|---|
| Баха Админ | `admin@bakha.kz` | `admin123` | owner |
| Алия Менеджер | `aliya@bakha.kz` | `demo123` | manager |
| Данияр Замерщик | `daniyar@bakha.kz` | `demo123` | measurer |
| Руслан Монтажник | `ruslan@bakha.kz` | `demo123` | installer |

### Re-seed (reset to demo data)

```bash
npm run db:seed
```

This wipes all data and re-creates the above users with SHA-256 hashes (auto-upgraded to bcrypt on first login).

---

## 6. Production Password Setup

Before first production deployment:

1. Run `npm run db:seed` to create the initial users
2. Log in as `admin@bakha.kz` with `admin123` — the hash auto-upgrades to bcrypt
3. **Immediately** change the admin password via Settings → Пользователи → Пароль
4. Create real user accounts with strong passwords
5. Deactivate the demo seed users if not needed

**Never store production passwords in docs or `.env.example`.**

---

## 7. Protected Routes (Frontend)

All routes inside `<RequireAuth>` redirect unauthenticated users to `/login`:

- `/dashboard`
- `/sales`
- `/measurements`
- `/leads/:id`
- `/chats`
- `/tasks`
- `/analytics`
- `/settings/users`
- `/settings/integrations`
- `/settings/integrations/telephony`
- `/settings/system`

### Session validation on mount

`ProtectedFrame` calls `GET /api/auth/me` on mount:
- If server confirms session → syncs latest user info (role changes take effect)
- If server returns 401 AND token is NOT `demo-token` → clears localStorage + redirect to `/login`
- If server unavailable → falls back to localStorage check (demo-token flow preserved)

---

## 8. User Management (Settings → Пользователи)

Available to `owner` and `admin` roles:

### Create user: `POST /api/users`
Fields: `name`, `email`, `phone?`, `role`, `password`

### Update user: `PATCH /api/users/:id`
Fields: `name?`, `phone?`, `status?` (`active`/`inactive`), `role?`

### Reset password: `POST /api/users/:id/set-password`
- Hashes new password with bcrypt
- Revokes all active sessions for that user (forces re-login)

### Deactivate user
- Set `status = 'inactive'` via PATCH
- Inactive users cannot log in (403 on login attempt)
- Existing sessions are NOT automatically revoked (session expiry handles this)
- To force immediate logout: reset password → this revokes all sessions

**No hard-delete.** Use deactivate/reactivate instead.

---

## 9. Security Properties

| Property | Status |
|---|---|
| Plaintext password storage | ✅ Never — bcrypt only |
| `password_hash` returned to frontend | ✅ Never — excluded from all API responses |
| Session token in logs | ✅ Only token_hash stored in DB |
| Secrets returned to browser | ✅ System status masks tokens |
| Inactive user login | ✅ Blocked (403) |
| Expired session | ✅ Rejected by `getSessionUser` |
| Revoked session | ✅ Rejected by `isNull(revokedAt)` check |
| 401 on unauthenticated API | ✅ All mutation endpoints |
| 403 on wrong role | ✅ Admin-only endpoints |
| CSRF protection | ⚠️ `sameSite: lax` + same-origin Vite proxy (adequate for MVP) |
| HTTPS | ⚠️ Cookie `secure: true` only when `NODE_ENV=production` |

---

## 10. Known Limitations and Next Steps

### Limitations (MVP scope)

- No refresh token — session is 7 days, then must re-login
- No "remember me" toggle (always 7 days)
- No 2FA
- Frontend RBAC is cosmetic only — hidden nav items, not locked routes
- `measurer` and `installer` roles have no dedicated filtered views yet
- Audit log does not yet record `actorId` (authenticated user) on all mutations
- No email verification for new users
- No rate limiting on login endpoint (brute-force protection)

### Recommended next phase

1. Add `actorId` to `audit_logs` and populate from `res.locals.currentUser.id`
2. Add rate limiting on `POST /api/auth/login` (e.g., 10 attempts/minute)
3. Add route-level guards for measurer/installer (filter visible leads by assignee)
4. Add user profile edit endpoint (`PATCH /api/auth/me`)
5. Add `PATCH /api/leads/:id` actor tracking
6. Add email notifications for password reset
7. Switch to refresh-token pattern for longer sessions

---

## 11. Files Changed in This Phase

| File | Change |
|---|---|
| `db/schema/index.ts` | Added `sessions` table, `lastLoginAt` to users |
| `db/seed/data.ts` | Changed admin@bakha.kz role to `owner` |
| `db/seed/seed.ts` | Added `owner` role, updated permissions logic |
| `backend/server/src/index.ts` | bcryptjs imports, session helpers, auth middleware, updated login, added logout/me/user-management routes, protected mutation endpoints, `ensureAuthSchema` |
| `backend/server/package.json` | Added `bcryptjs` + `@types/bcryptjs` |
| `frontend/apps/web/src/App.tsx` | `credentials:include` everywhere, 401 redirect, session validation on mount, server-side logout, RBAC nav, improved UsersSettingsPage, CreateUserModal, SetPasswordModal |
| `docs/AUTH_RBAC_PLAN.md` | This document |
| `docs/CLIENT_LAUNCH_CHECKLIST.md` | Updated with auth/password setup section |
