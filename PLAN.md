# Hye-Yield — Schwab Auto-Investment Platform
**Technical Build Plan — Claude Code Edition**
Version 1.0 | March 2026

---

## Tech Stack

| Layer     | Choice                 | Reason                          |
|-----------|------------------------|---------------------------------|
| Backend   | FastAPI + Python       | Async, auto-docs, fast          |
| Frontend  | React + Vite           | SPA, component-based            |
| Database  | SQLite                 | Simple, zero setup, single server |
| Auth      | JWT tokens             | Stateless, secure               |
| Scheduler | APScheduler            | Built-in, no Redis needed       |
| Secrets   | AES-256 (Fernet)       | API keys encrypted at rest      |
| Proxy     | Nginx + SSL            | HTTPS, serves React build       |
| Process   | systemd                | Auto-restart on reboot          |
| Notify    | ntfy.sh                | Already working                 |

---

## Project Overview

Hye-Yield is a multi-user web platform that automates bi-weekly Sharia-compliant ETF investing (SPUS, IAU, VDE) across multiple Schwab brokerage accounts via the Schwab Trader API.

The existing proof-of-concept scripts (`auto_invest.py`, `check_balance.py`, `get_tokens.py`) contain the core business logic. This plan re-architects that logic into a proper multi-tier web application with JWT auth, a React dashboard, REST API, SQLite database, and a persistent background scheduler.

**Target server:** GCP VM `schwab-bot` (136.111.43.16, user: `rafiulhye91`)

---

## Repository Structure

```
hyeyield/
├── backend/
│   ├── main.py              ← FastAPI entry point
│   ├── config.py            ← Settings from .env
│   ├── database.py          ← SQLite + SQLAlchemy async
│   ├── models/              ← ORM models (user, account, allocation, log)
│   ├── routers/             ← API route handlers
│   ├── services/            ← Schwab client, invest engine, scheduler
│   └── utils/               ← Crypto, JWT helpers
├── frontend/
│   └── src/
│       ├── pages/           ← Login, Dashboard, Accounts, History, Settings
│       ├── components/      ← Shared UI components
│       └── api/             ← API client with auth
├── nginx/hyeyield.conf
├── hyeyield.db              ← SQLite database file
└── .env                     ← Secrets (never commit)
```

---

## Phase Summary

| Phase | Name | Key Deliverable | Test Gate |
|-------|------|-----------------|-----------|
| 1 | Scaffolding & DB | 4 SQLite tables via Alembic | Tables visible in sqlite3 CLI |
| 2 | Auth & API Foundation | Register, login, JWT auth | All /auth endpoints return correct status codes |
| 3 | Schwab Integration | OAuth connect + live balances | GET /schwab/balances returns real data |
| 4 | Investment Engine | Dry-run + live orders + logs | Dry run returns correct shares calc |
| 5 | Background Scheduler | Bi-weekly auto-invest jobs | Scheduled job runs and logs appear |
| 6 | React Frontend | Full SPA — all 5 pages | End-to-end flow in browser |
| 7 | Production Deployment | HTTPS on GCP VM, systemd | App live at hyeyield.duckdns.org |
| 8 | Testing & Hardening | 20-step E2E test, security fixes | All 20 steps pass, rate limit works |

---

## Phase 1 — Project Scaffolding & Database Setup

Set up the repo structure, Python virtual environment, SQLite database, and SQLAlchemy models.

### Task 1.1: Repository & Virtual Environment

- [ ] Create folder structure: `hyeyield/backend/models/`, `routers/`, `services/`, `utils/`, `frontend/`, `nginx/`
- [ ] Create Python virtual environment at `hyeyield/venv/`
- [ ] Create `requirements.txt`:
  ```
  fastapi==0.111.0
  uvicorn[standard]==0.29.0
  sqlalchemy[asyncio]==2.0.30
  aiosqlite==0.20.0
  alembic==1.13.1
  python-jose[cryptography]==3.3.0
  passlib[bcrypt]==1.7.4
  python-dotenv==1.0.1
  httpx==0.27.0
  cryptography==42.0.5
  apscheduler==3.10.4
  pydantic-settings==2.2.1
  pytest==8.2.0
  pytest-asyncio==0.23.6
  ```
- [ ] Create `.env` with placeholders: `SECRET_KEY`, `ENCRYPT_KEY`, `ENVIRONMENT=dev`, `JWT_EXPIRE_HOURS=24`
- [ ] Create `.gitignore` excluding: `.env`, `venv/`, `__pycache__`, `*.pyc`, `hyeyield.db`

**Notes:**
- Python 3.11+ required
- Generate `ENCRYPT_KEY`: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- Generate `SECRET_KEY`: `python -c "import secrets; print(secrets.token_hex(32))"`

**Test Steps:**
1. `cd hyeyield && source venv/bin/activate`
2. `pip install -r requirements.txt` — no errors
3. `python -c "import fastapi, sqlalchemy, jose, cryptography"` — no output
4. Verify `.env` has all 4 keys
5. Verify `hyeyield.db` does NOT exist yet

---

### Task 1.2: SQLAlchemy Async Models

- [ ] Create `backend/database.py` — async engine, `AsyncSessionLocal`, `Base`, `get_db` dependency
- [ ] Create `backend/models/user.py` — `id`, `username`, `email`, `password_hash`, `ntfy_topic`, `schedule_cron` (default `'35 9 1,15 * *'`), `created_at`
- [ ] Create `backend/models/schwab_account.py` — `id`, `user_id` (FK CASCADE), `account_number`, `account_name`, `account_type`, `app_key_enc`, `app_secret_enc`, `refresh_token_enc`, `rotation_state` (default 0), `enabled` (default True), `min_order_value` (default 1.0), `remainder_symbol` (default `'SPUS'`), `last_run`, `created_at`
- [ ] Create `backend/models/allocation.py` — `id`, `account_id` (FK CASCADE), `symbol`, `target_pct`, `display_order`
- [ ] Create `backend/models/trade_log.py` — `id`, `user_id` (FK), `account_id` (FK nullable), `symbol`, `shares`, `price`, `amount`, `status`, `message`, `dry_run`, `created_at`
- [ ] Create `backend/models/__init__.py` importing all 4 models
- [ ] Set up Alembic: `alembic init migrations`, configure `alembic.ini` and `env.py`, run initial migration

**Test Steps:**
1. `alembic upgrade head` — 1 migration applied
2. Verify tables: `['users', 'schwab_accounts', 'allocations', 'trade_logs', 'alembic_version']`

---

## Phase 2 — Backend Core: Auth & API Foundation

### Task 2.1: FastAPI App & Config

- [ ] Create `backend/config.py` using pydantic-settings `BaseSettings` with all env vars
- [ ] Create `backend/main.py`:
  - FastAPI app with title/version
  - CORS for `http://localhost:5173` and `https://hyeyield.duckdns.org`
  - `GET /health` → `{status: 'ok', version: '1.0'}`
  - Startup: run `alembic upgrade head`
  - Include routers: auth, accounts, invest, logs

**Test Steps:**
1. `uvicorn backend.main:app --reload`
2. `curl http://localhost:8000/health` → `{"status":"ok","version":"1.0"}`
3. Open `http://localhost:8000/docs` — Swagger UI loads

---

### Task 2.2: AES Encryption & Password Hashing

- [ ] Create `backend/utils/crypto.py`:
  - `encrypt(plaintext: str) -> str` using Fernet with `ENCRYPT_KEY`
  - `decrypt(ciphertext: str) -> str` — raises `ValueError` on failure
- [ ] Create `backend/utils/auth_utils.py`:
  - `hash_password(password: str) -> str`
  - `verify_password(plain: str, hashed: str) -> bool`
- [ ] Add helper methods to `SchwabAccount`: `get_app_key()`, `get_app_secret()`, `get_refresh_token()`, `set_app_key()`, `set_app_secret()`, `set_refresh_token()`

**Notes:** Never log plaintext API keys — only encrypted versions or `'REDACTED'`

**Test Steps:**
1. `encrypt('hello')` → decrypt → `'hello'`
2. Verify encrypted string is unreadable base64
3. `hash_password` / `verify_password` returns `True False` for correct/wrong password
4. Two `encrypt('same')` calls produce different output (random IVs)

---

### Task 2.3: JWT Utility & Auth Dependency

- [ ] Create `backend/utils/jwt_utils.py`:
  - `create_access_token(user_id: int) -> str`
  - `decode_token(token: str) -> int` — raises 401 on invalid/expired
  - `get_current_user(token, db) -> User` — FastAPI dependency
  - `OAuth2PasswordBearer(tokenUrl='/auth/login')`

**Test Steps:**
1. `create_access_token(42)` → `decode_token` → `42`
2. Modified token → 401
3. Protected endpoint without token → 401

---

### Task 2.4: Auth Router

- [ ] Create `backend/schemas/auth.py`: `RegisterRequest`, `LoginRequest`, `AuthResponse`, `UserProfile`
- [ ] Create `backend/routers/auth.py`:
  - `POST /auth/register` — validate, check uniqueness (409), hash password, return token
  - `POST /auth/login` — verify credentials, return token (always 401 for wrong user OR password — never reveal which)
  - `GET /auth/me` [protected] — return `UserProfile` (never `password_hash`)

**Test Steps:**
1. Register → 200 + token
2. Duplicate username → 409
3. Duplicate email → 409
4. Login correct → 200 + token
5. Login wrong password → 401
6. `GET /auth/me` with token → user profile
7. `GET /auth/me` without token → 401

---

## Phase 3 — Schwab Integration: OAuth, Balances & Config

### Task 3.1: Schwab API Client Service

- [ ] Create `backend/services/schwab_client.py` with `class SchwabClient`:
  - `__init__(app_key, app_secret, refresh_token)` — httpx.AsyncClient, 30s timeout
  - `_basic_auth() -> str` — base64 encoded `app_key:app_secret`
  - `async refresh_access_token() -> tuple[str, str]` — POST to Schwab OAuth
  - `async get_account_hashes(access_token) -> dict[str, str]`
  - `async get_all_balances(access_token) -> list[dict]`
  - `async get_quote(access_token, symbol) -> float`
  - `async place_order(access_token, account_hash, symbol, shares) -> tuple[str, str]` — checks market hours (9:30-16:00 ET)
- [ ] Create `SchwabAuthError` and `SchwabAPIError` exception classes

**Notes:**
- Use `httpx.AsyncClient` (NOT `requests` — it's sync)
- `SchwabClient` does NOT save rotated refresh token — caller saves to DB
- Log all API calls at DEBUG level

**Test Steps:**
1. Mock tests for `refresh_access_token`, `get_quote`, `place_order`
2. `pytest backend/tests/test_schwab_client.py` — all pass

---

### Task 3.2: Schwab Accounts Router

- [ ] Create `backend/schemas/account.py`: `AccountCreate`, `AccountUpdate`, `AccountResponse`, `ConnectRequest`
- [ ] Create `backend/routers/schwab.py`:
  - `GET /schwab/auth-url?account_id={id}` [protected] — return OAuth URL
  - `POST /schwab/connect` [protected] — exchange code for tokens, save encrypted refresh_token
  - `GET /schwab/balances` [protected] — refresh tokens, fetch live balances
  - `GET /accounts` [protected]
  - `POST /accounts` [protected] — encrypt app_key and app_secret
  - `PUT /accounts/{id}` [protected]
  - `DELETE /accounts/{id}` [protected] — cascades to allocations + logs

**Notes:**
- ALWAYS verify `account.user_id == current_user.id` — return 403 otherwise
- Save NEW refresh_token to DB IMMEDIATELY after every `refresh_access_token()` call
- `redirect_uri` must match exactly: `https://hyeyield.duckdns.org/redirect`

**Test Steps:**
1. Create account → verify DB stores encrypted keys
2. Get auth-url → complete OAuth in browser
3. `POST /schwab/connect` → `{success: true}`
4. `GET /schwab/balances` → live data
5. `DELETE /accounts/1` → cascade deletes allocations
6. Other user's token → empty list (not 403)

---

### Task 3.3: Allocations CRUD

- [ ] Add to `backend/routers/schwab.py`:
  - `GET /accounts/{id}/allocations` [protected]
  - `PUT /accounts/{id}/allocations` [protected]:
    - Validate: non-empty, symbols match `^[A-Z]{1,10}$`, pcts sum to 100.0 (±0.01)
    - Atomic delete + insert in single DB transaction

**Test Steps:**
1. PUT `[{SPUS,50,0},{IAU,30,1},{VDE,20,2}]` → 200
2. GET → same 3 items in order
3. Pcts sum to 99 → 422
4. Empty list → 422
5. Lowercase symbol → 422

---

## Phase 4 — Investment Engine

### Task 4.1: Invest Engine Service

- [ ] Create `backend/services/invest_engine.py`:
  - `@dataclass OrderResult`: `symbol`, `shares`, `price`, `amount`, `status`, `message`, `is_remainder`
  - `@dataclass InvestResult`: `account_number`, `account_name`, `orders`, `total_invested`, `cash_before`, `cash_after`, `rotation_used`, `dry_run`, `error`
  - `class InvestEngine`:
    - `__init__(db, user_id)`
    - `async run_account(account_id, dry_run=True) -> InvestResult`:
      1. Load account + allocations (ordered by `display_order`)
      2. Check connected, create `SchwabClient`
      3. Refresh token, save to DB immediately
      4. Get account hashes and balances
      5. Check `cash >= min_order_value`
      6. Apply rotation: `ordered = allocations[rotation_state % n:] + allocations[:rotation_state % n]`
      7. For each alloc: `shares = int(amount / price)` (whole shares only — floor)
      8. Place orders or record DRY_RUN, log to `trade_logs`
      9. Buy remainder shares with leftover cash using `remainder_symbol`
      10. Advance `rotation_state`, update `last_run`
    - `async run_all(dry_run=True) -> list[InvestResult]`

**Notes:**
- Whole shares ONLY — Schwab rejects fractional shares
- If one order fails, log and continue — do NOT abort the run
- Do NOT call ntfy from invest_engine — caller handles notifications

**Test Steps:**
1. Rotation: run 1 = `[SPUS,IAU,VDE]`, run 2 = `[IAU,VDE,SPUS]`
2. `$500 cash, 50% alloc, price $168` → 1 share (not 1.48)
3. `dry_run=True` → status `'DRY_RUN'`, no HTTP calls
4. `cash=0.50` → error returned, no orders
5. Remainder: leftover cash buys SPUS shares

---

### Task 4.2: Invest Router

- [ ] Create `backend/routers/invest.py`:
  - `POST /invest/dry-run` [protected] — optional `account_id`, runs engine with `dry_run=True`
  - `POST /invest/live` [protected] — requires `X-Confirm-Live: true` header, sends ntfy after
  - `GET /invest/rotation` [protected] — next run order per account
  - `POST /invest/rotation/reset` [protected] — set `rotation_state = 0`
  - `GET /logs` [protected] — paginated, filterable by `account_id`, `dry_run`, `symbol`
- [ ] Create `backend/services/notify.py`:
  - `async send_notify(topic, title, message)` — POST to ntfy.sh, fail silently

**Notes:**
- `X-Confirm-Live` header prevents accidental live orders
- Serialize `InvestResult` with `dataclasses.asdict()`

**Test Steps:**
1. `POST /invest/dry-run` → `InvestResult` with `dry_run=true`
2. `trade_logs` has new rows with `dry_run=true`
3. `POST /invest/live` without header → 400
4. `GET /logs?symbol=SPUS` → only SPUS rows

---

## Phase 5 — Background Scheduler

### Task 5.1: APScheduler — Per-User Invest Jobs

- [ ] Create `backend/services/scheduler.py`:
  - `AsyncIOScheduler(timezone='America/New_York')`
  - `async scheduled_invest(user_id)` — run all accounts, send ntfy
  - `register_invest_job(user_id, cron_expr)` — `add_job` with `replace_existing=True`, `misfire_grace_time=3600`
  - `remove_invest_job(user_id)`
  - `async load_all_jobs()` — register jobs for all users on startup
- [ ] Wire into `main.py` startup/shutdown events
- [ ] Add endpoints:
  - `GET /invest/schedule` [protected]
  - `PUT /invest/schedule` [protected] — validate 5-field cron, update DB + scheduler, return `next_run`

**Notes:**
- `AsyncIOScheduler` — do NOT use `BackgroundScheduler`
- Default schedule: `'35 9 1,15 * *'` (9:35 AM on 1st and 15th)
- Use `workers=1` in uvicorn to avoid double-firing

**Test Steps:**
1. Startup logs show "Registered invest job for user X"
2. Set `'*/2 * * * *'` → wait 2 min → new `trade_logs` entry
3. Verify ntfy notification received
4. Restart uvicorn → job re-registered from DB

---

### Task 5.2: Token Keep-Alive Job

- [ ] Add to `scheduler.py`:
  - `async refresh_tokens_job(user_id)` — refresh all connected accounts' tokens every 5 days
  - `register_token_refresh_job(user_id)` — `interval`, `days=5`
  - Call in `load_all_jobs()` and when user connects Schwab account

**Notes:**
- 5-day interval is within Schwab's 7-day refresh_token expiry
- On `SchwabAuthError`: log `TOKEN_REFRESH` as FAILED, send ntfy to re-connect

**Test Steps:**
1. Manually invoke `refresh_tokens_job` → verify `refresh_token_enc` changed in DB
2. `GET /schwab/balances` still works with new token
3. Scheduler has both `invest_1` and `token_refresh_1` jobs registered
4. Corrupt token → ntfy notification sent

---

## Phase 6 — React Frontend

### Task 6.1: React Setup & API Client

- [ ] `npm create vite@latest . -- --template react` in `hyeyield/frontend/`
- [ ] `npm install react-router-dom axios`
- [ ] Create `frontend/src/api/client.js`:
  - axios instance with `baseURL = VITE_API_URL || 'http://localhost:8000'`
  - Request interceptor: auto-attach `Authorization: Bearer {token}`
  - Response interceptor: on 401, clear token, redirect to `/login`
- [ ] Create `frontend/src/context/AuthContext.jsx`:
  - `login(token, user)`, `logout()`, verify token on mount via `GET /auth/me`
- [ ] Create `frontend/src/App.jsx`:
  - Routes: `/login`, `/register`, `/dashboard`, `/accounts`, `/history`, `/settings`
  - `ProtectedRoute` component
- [ ] Create `frontend/.env.local`: `VITE_API_URL=http://localhost:8000`

**Test Steps:**
1. `npm run dev` → loads at `http://localhost:5173`
2. Navigate to `/dashboard` without login → redirects to `/login`

---

### Task 6.2: Auth Pages & Shared Layout

- [ ] Create `Login.jsx` — username/password form, inline error on 401
- [ ] Create `Register.jsx` — username/email/password, auto-login on success
- [ ] Create `Layout.jsx` — navbar with logo, nav links, logout, active route highlight, mobile hamburger

**CSS:** Plain CSS — `primary #2563EB`, `bg #F9FAFB`, `card #FFFFFF`, `text #111827`, `border-radius 12px`

**Test Steps:**
1. Register → auto-redirect to `/dashboard`
2. Login wrong password → inline error
3. Nav links highlight based on URL
4. Mobile: nav usable at < 640px

---

### Task 6.3: Dashboard Page

- [ ] Create `Dashboard.jsx`:
  - Balance cards: account name, type badge, total value, cash, green/gray status dot
  - Rotation status: "Run #N — Next order: SPUS → IAU → VDE", last_run timestamp
  - **Dry Run** button → results modal with `DRY RUN — No orders were placed` banner
  - **Invest Now** button → confirmation dialog → `POST /invest/live` with `X-Confirm-Live: true` header
  - Auto-refresh every 5 minutes, manual Refresh button
  - Disable Invest Now if no accounts connected

**Test Steps:**
1. Real Schwab balances in cards
2. Dry Run → results modal with DRY RUN banner
3. Invest Now → confirmation dialog → cancel = no API call
4. Confirm during market hours → order appears in Schwab + History

---

### Task 6.4: Accounts Config Page

- [ ] Create `Accounts.jsx`:
  - Account list from `GET /accounts`
  - "Connect Schwab" flow: step 1 OAuth URL modal, step 2 redirect URL input
  - Allocations editor: inline table with symbol/%, live sum validation (red if ≠ 100, green if = 100), Save disabled until 100%
  - Settings row: remainder symbol, min order value
  - "Add Account" form at top (App Key/Secret as `type='password'`)
  - Delete with confirmation

**Test Steps:**
1. Add account → appears in list
2. Connect Schwab → Connected badge
3. Edit allocations 50/30/20 → sum 100% green → Save works
4. 50/30 (80%) → Save disabled
5. Reload → allocations persist

---

### Task 6.5: History & Settings Pages

- [ ] Create `History.jsx`:
  - Table: Date, Account, Symbol, Shares, Price, Amount, Status, Type
  - Status badges: `FILLED`=green, `WORKING`=yellow, `REJECTED`/`CANCELED`=red, `DRY_RUN`=gray
  - Filters: symbol, account dropdown, "Live only" toggle, date range
  - Pagination: 50/page with Prev/Next
  - Export CSV button
- [ ] Create `Settings.jsx`:
  - **Investment Schedule:** cron input with human-readable preview, Save → `PUT /invest/schedule`
  - **Notifications:** ntfy topic input, Save, "Send Test Notification" → `POST /invest/test-notify`
  - **Change Password:** current/new/confirm fields → `POST /auth/change-password`
  - **Danger Zone:** Delete Account (type username to confirm) → `DELETE /auth/me`
- [ ] Add backend endpoints: `POST /invest/test-notify`, `POST /auth/change-password`, `DELETE /auth/me`

**Test Steps:**
1. History loads all logs
2. Filter by symbol → matching rows only
3. "Live only" → dry run rows hidden
4. Export CSV → correct columns
5. Test notification → received on phone
6. Change password → login with new password works

---

## Phase 7 — Production Deployment on GCP VM

### Task 7.1: Build React & Configure Nginx

- [ ] `npm run build` in `frontend/` → creates `frontend/dist/`
- [ ] Create `nginx/hyeyield.conf`:
  - `server_name hyeyield.duckdns.org`
  - `root /home/rafiulhye91/hyeyield/frontend/dist`
  - `try_files $uri /index.html` — critical for React Router
  - Proxy locations for `/auth/`, `/schwab/`, `/accounts/`, `/invest/`, `/logs/`, `/health`
  - Forward `Authorization` header explicitly (Nginx strips it by default)
- [ ] `sudo ln -s ~/hyeyield/nginx/hyeyield.conf /etc/nginx/sites-enabled/`
- [ ] `sudo nginx -t && sudo systemctl reload nginx`
- [ ] Build frontend with `VITE_API_URL=''` for relative URLs

**Test Steps:**
1. `sudo nginx -t` → syntax ok
2. `curl http://hyeyield.duckdns.org` → React HTML
3. `curl http://hyeyield.duckdns.org/health` → `{"status":"ok"}`
4. Login works through Nginx

---

### Task 7.2: SSL Certificate & systemd Service

- [ ] Install certbot: `sudo apt-get install certbot python3-certbot-nginx -y`
- [ ] `sudo certbot --nginx -d hyeyield.duckdns.org`
- [ ] Update CORS in `main.py` to `https://hyeyield.duckdns.org` only
- [ ] Rebuild React with `frontend/.env.production`: `VITE_API_URL=''`
- [ ] Create `/etc/systemd/system/hyeyield.service`:
  ```ini
  [Unit]
  Description=Hye-Yield FastAPI Backend
  After=network.target

  [Service]
  User=rafiulhye91
  WorkingDirectory=/home/rafiulhye91/hyeyield
  EnvironmentFile=/home/rafiulhye91/hyeyield/.env
  ExecStart=/home/rafiulhye91/hyeyield/venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
  Restart=always
  RestartSec=5

  [Install]
  WantedBy=multi-user.target
  ```
- [ ] `sudo systemctl daemon-reload && sudo systemctl enable hyeyield && sudo systemctl start hyeyield`
- [ ] Remove old cron job: `crontab -e`, delete `auto_invest.py` line

**Test Steps:**
1. `https://hyeyield.duckdns.org` → padlock in browser
2. `http://` redirects to `https://` automatically
3. After `sudo reboot` → `systemctl status hyeyield` shows active
4. `sudo systemctl kill hyeyield` → restarts within 5 seconds

---

## Phase 8 — Testing, Hardening & Go-Live

### Task 8.1: End-to-End Investment Flow Test

Manual checklist — no code to write. Run in order:

- [ ] 1. Open `https://hyeyield.duckdns.org/register` in incognito
- [ ] 2. Register a new user
- [ ] 3. Go to Accounts → add Schwab account (app_key, app_secret)
- [ ] 4. Click Connect Schwab → complete OAuth flow
- [ ] 5. Verify Connected badge
- [ ] 6. Go to Dashboard → verify live Schwab balances in cards
- [ ] 7. Go to Accounts → set allocations: SPUS 50%, IAU 30%, VDE 20%
- [ ] 8. Go to Dashboard → click Dry Run
- [ ] 9. Verify results modal with expected shares and DRY RUN banner
- [ ] 10. Verify rotation state advanced by 1
- [ ] 11. Go to History → verify dry run entries with gray DRY_RUN badge
- [ ] 12. During market hours (9:30 AM - 4:00 PM ET): click Invest Now
- [ ] 13. Read confirmation dialog → click Confirm
- [ ] 14. Verify results modal shows orders placed
- [ ] 15. Open Schwab web app → verify orders appear
- [ ] 16. Go to History → verify FILLED or WORKING status
- [ ] 17. Check phone → ntfy notification received
- [ ] 18. Go to Settings → set schedule to `*/5 * * * *` (every 5 min for testing)
- [ ] 19. Wait 5 minutes → verify automated run in History
- [ ] 20. Set schedule back to `35 9 1,15 * *`

**Note:** For step 12, have at least $200 cash in account to ensure ≥1 share of each ETF.

---

### Task 8.2: Security Hardening & Cutover

- [ ] `.env` permissions: `chmod 600 ~/hyeyield/.env`
- [ ] DB permissions: `chmod 600 ~/hyeyield/hyeyield.db`
- [ ] Rate limiting on `/auth/login` (max 5/min per IP via `slowapi`)
- [ ] Nginx security headers:
  ```nginx
  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
  ```
- [ ] Verify UFW: only ports 22, 80, 443 allowed
- [ ] Install Fail2Ban: `sudo apt-get install fail2ban -y`
- [ ] Cutover (after 2+ days running without issues):
  - Archive old scripts: `mkdir ~/scripts_archive && mv ~/auto_invest.py ~/check_balance.py ~/get_tokens.py ~/scripts_archive/`
  - Do NOT delete — keep 30 days as backup
  - Verify crontab has no `auto_invest.py` line

**Test Steps:**
1. 6 rapid POST `/auth/login` → 6th returns 429
2. `curl -I https://hyeyield.duckdns.org` → `X-Frame-Options` in headers
3. `sudo ufw status` → only 22, 80, 443
4. `sudo fail2ban-client status sshd` → active
5. `ls ~/scripts_archive/` → old scripts present
6. `crontab -l` → no `auto_invest.py` line

---

## Quick Reference

```bash
# Always run from hyeyield/ with venv active
source venv/bin/activate

# After any model change
alembic revision --autogenerate -m 'description' && alembic upgrade head

# Restart service after code changes
sudo systemctl restart hyeyield

# Follow logs
sudo journalctl -u hyeyield -f

# SQLite quick check
sqlite3 ~/hyeyield/hyeyield.db
> .tables
> SELECT * FROM trade_logs;

# React dev server (runs on :5173, proxies to :8000)
cd frontend && npm run dev

# Rebuild frontend after changes
cd frontend && npm run build
# then reload Nginx
```
