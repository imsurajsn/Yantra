# Yantra

Open-source, self-hosted internal tool platform with first-class governance — RBAC, audit logging, and SSO built in. Deploy in one command. Your data never leaves your infrastructure.

> **V1 status:** Active development. Configuration-driven pages (no drag-and-drop builder). Visual builder lands in V2.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/yantra-platform/yantra && cd yantra

# 2. Configure
cp .env.example .env
# Edit .env — at minimum, change APP_SECRET to a random 32+ char string:
# openssl rand -hex 32

# 3. Launch
docker compose up -d

# 4. Complete setup
open http://localhost:8080/setup
```

On first run, navigate to `/setup` to create your Admin account. Once setup is complete, `/setup` is permanently disabled.

---

## Configuration

All configuration is environment-variable driven. See `.env.example` for the full list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_SECRET` | **yes** | — | Signs JWTs and derives AES-256 encryption key. Generate: `openssl rand -hex 32` |
| `DB_TYPE` | no | `postgres` | Database dialect: `postgres`, `mysql`, `mariadb` |
| `DB_HOST` | no | `postgres` | Database host (use service name in Docker Compose) |
| `DB_PORT` | no | `5432` | Database port |
| `DB_NAME` | no | `yantra` | Database name |
| `DB_USER` | no | `yantra` | Database user |
| `DB_PASSWORD` | no | `yantra` | Database password |
| `DB_SSL_MODE` | no | `disable` | Set to `require` in production |
| `PORT` | no | `8080` | HTTP port the app listens on |
| `SESSION_DURATION_HOURS` | no | `8` | JWT session lifetime |
| `BCRYPT_COST` | no | `12` | bcrypt work factor |

### Using an external database

Point Yantra at your own PostgreSQL, MySQL 8.x, or MariaDB 10.6+ instance:

```bash
DB_TYPE=postgres
DB_HOST=your-db.example.com
DB_PORT=5432
DB_NAME=yantra_prod
DB_USER=yantra_user
DB_PASSWORD=strong_password
DB_SSL_MODE=require
```

Remove the `postgres` service from `docker-compose.yml` if you're providing your own.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | Go 1.22 + Gin | Small binary, great Docker packaging, strong concurrency for audit writes |
| ORM | GORM | Multi-DB support (Postgres, MySQL, MariaDB) with AutoMigrate |
| Frontend | React 18 + TypeScript + Vite | Standard, type-safe, Vite for fast builds |
| Auth | Custom JWT + bcrypt (cost 12) | No external dependency; all auth data stays in your DB |
| Secrets at rest | AES-256-GCM | API keys in page configs encrypted before DB write |
| Packaging | Docker Compose | One command, no Kubernetes required |
| License | AGPL-3.0 | Prevents cloud hosting without contribution |

---

## High-Level Design (HLD)

```
┌───────────────────────────────────────────────────────────────┐
│                     docker compose up                         │
│                                                               │
│  ┌─────────────────────────────────────┐  ┌───────────────┐  │
│  │         yantra (Go binary)           │  │  PostgreSQL   │  │
│  │                                     │  │  (or MySQL /  │  │
│  │  ┌──────────────┐ ┌──────────────┐  │  │   MariaDB)    │  │
│  │  │  REST API    │ │  React SPA   │  │  │               │  │
│  │  │  (Gin)       │ │  (embedded   │  │  │  Tables:      │  │
│  │  │  :8080/api   │ │   via embed) │  │  │  users        │  │
│  │  │              │ │  :8080/*     │  │  │  groups       │  │
│  │  └──────┬───────┘ └──────────────┘  │  │  group_mbrs   │  │
│  │         │                           │  │  pages        │  │
│  │  ┌──────▼───────────────────────┐   │  │  page_acl     │  │
│  │  │  Middleware stack             │   │  │  audit_logs   │  │
│  │  │  SetupGuard → Auth(JWT) →    │   │  └───────────────┘  │
│  │  │  RequirePermission(string)   │   │                     │
│  │  └──────────────────────────────┘   │                     │
│  └─────────────────────────────────────┘                     │
└───────────────────────────────────────────────────────────────┘
```

### Request lifecycle

```
Browser → GET /pages/42
         → SetupGuard (pass: admin exists)
         → Auth middleware (verify JWT, check token_version)
         → Handler: resolvePageRole(caller, pageID)
                     → query page_acl + group_members
                     → return highest role
         → CanOnPage(role, "page.view") → 200 or 403
         → callRESTDataSource(config) → decrypt secret → upstream API
         → writeAuditLog (goroutine, fire-and-forget)
         → JSON response
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Single binary (Go embeds React) | No Node runtime in production; ~50 MB Docker image |
| Page configs in DB | Admin edits pages in-product; no container restart needed |
| Audit log: append-only | No UPDATE/DELETE routes exist anywhere in the codebase |
| Token version on User row | Server-side JWT invalidation on logout or account disable |
| `user.Can("permission.string")` everywhere | Never `role == "Admin"` — ready for V2 custom roles without migration |
| AES-256-GCM for API secrets | Auth headers encrypted before DB write; key derived from APP_SECRET |
| `[REDACTED]` merge on config save | Frontend never receives plaintext secrets; update flow preserves existing encrypted values |

---

## Low-Level Design (LLD)

### Database schema

```sql
-- users
CREATE TABLE users (
  id                  BIGSERIAL PRIMARY KEY,
  email               VARCHAR UNIQUE NOT NULL,
  display_name        VARCHAR NOT NULL,
  password_hash       VARCHAR NOT NULL,         -- bcrypt, cost 12
  workspace_role      VARCHAR NOT NULL DEFAULT 'Viewer',  -- Admin | Member | Viewer
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  token_version       INT NOT NULL DEFAULT 0,   -- incremented on logout / deactivate
  last_login_at       TIMESTAMP,
  created_at          TIMESTAMP,
  updated_at          TIMESTAMP
);

-- groups
CREATE TABLE groups (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- group_members
CREATE TABLE group_members (
  group_id   BIGINT NOT NULL REFERENCES groups(id),
  user_id    BIGINT NOT NULL REFERENCES users(id),
  group_role VARCHAR NOT NULL DEFAULT 'Group Member',  -- Group Admin | Group Member
  created_at TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);

-- pages
CREATE TABLE pages (
  id         BIGSERIAL PRIMARY KEY,
  title      VARCHAR NOT NULL,
  page_type  VARCHAR NOT NULL,    -- data_table | form
  config     TEXT NOT NULL,       -- JSON; secret fields AES-256-GCM encrypted ("enc:<base64>")
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- page_acl_entries
CREATE TABLE page_acl_entries (
  id           BIGSERIAL PRIMARY KEY,
  page_id      BIGINT NOT NULL REFERENCES pages(id),
  subject_type VARCHAR NOT NULL,  -- user | group
  subject_id   BIGINT NOT NULL,
  page_role    VARCHAR NOT NULL,  -- Owner | Editor | Viewer
  created_at   TIMESTAMP
);

-- audit_logs (append-only — no UPDATE/DELETE routes)
CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_email   VARCHAR NOT NULL,
  event_type   VARCHAR NOT NULL,  -- login | logout | page_view | form_submit | api_call
  page_id      BIGINT,
  ip_address   VARCHAR,
  user_agent   VARCHAR,
  endpoint     VARCHAR,
  http_method  VARCHAR,
  http_status  INT,
  field_values TEXT,              -- JSON; sensitive fields stored as "[REDACTED]"
  timestamp    TIMESTAMP NOT NULL
);
```

### API surface

#### Public (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/api/setup/status` | Returns `{setup_complete: bool}` |
| POST | `/api/setup` | Create first Admin (disabled once complete) |
| POST | `/api/auth/login` | Returns `{token, user, must_change_password}` |

#### Authenticated (Bearer JWT required)
| Method | Path | Permission required |
|---|---|---|
| POST | `/api/auth/logout` | — (any authenticated user) |
| POST | `/api/auth/change-password` | — (own password only) |
| GET | `/api/me` | — |
| GET | `/api/pages` | — (filtered by ACL) |
| POST | `/api/pages` | `workspace.pages.create` |
| GET | `/api/pages/:id/config` | `page.edit_config` on page |
| PUT | `/api/pages/:id/config` | `page.edit_config` on page |
| DELETE | `/api/pages/:id` | `page.delete` on page OR `workspace.pages.delete_any` |
| GET | `/api/pages/:id/data` | `page.view` on page |
| POST | `/api/pages/:id/submit` | `page.view` on page |
| GET | `/api/pages/:id/acl` | `page.manage_acl` on page |
| POST | `/api/pages/:id/acl` | `page.manage_acl` on page |
| DELETE | `/api/pages/:id/acl/:acl_id` | `page.manage_acl` on page |
| GET | `/api/groups` | — |
| POST | `/api/groups` | `workspace.groups.create` |
| GET | `/api/groups/:id/members` | — |
| POST | `/api/groups/:id/members` | `workspace.groups.manage_all` OR Group Admin |
| DELETE | `/api/groups/:id/members/:uid` | `workspace.groups.manage_all` OR Group Admin |
| DELETE | `/api/groups/:id` | `workspace.groups.manage_all` OR Group Admin |
| GET | `/api/admin/users` | `workspace.users.create` |
| POST | `/api/admin/users` | `workspace.users.create` |
| PATCH | `/api/admin/users/:id/role` | `workspace.users.change_role` |
| PATCH | `/api/admin/users/:id/status` | `workspace.users.deactivate` |
| POST | `/api/admin/users/:id/reset-password` | `workspace.users.reset_password` |
| GET | `/api/admin/audit` | `workspace.audit.view` |

### Page config JSON structure

```jsonc
// Data Table page config (stored in pages.config)
{
  "url": "https://api.example.com/orders",
  "method": "GET",
  "auth_header_name": "Authorization",
  "auth_header_value": "enc:<base64-aes256-gcm-ciphertext>",  // encrypted at rest
  "columns": [
    { "key": "id",     "label": "Order ID", "type": "number" },
    { "key": "status", "label": "Status",   "type": "text"   }
  ]
}

// Form page config
{
  "url": "https://api.example.com/orders/refund",
  "method": "POST",
  "auth_header_name": "Authorization",
  "auth_header_value": "enc:<base64-aes256-gcm-ciphertext>",
  "fields": [
    { "key": "order_id", "label": "Order ID",       "type": "text",   "required": true  },
    { "key": "amount",   "label": "Refund amount",   "type": "number", "required": true  },
    { "key": "reason",   "label": "Reason",          "type": "select", "required": false,
      "options": ["duplicate", "damaged", "other"] }
  ]
}
```

### RBAC enforcement flow

```
resolvePageRole(callerID, isAdmin, pageID):
  if isAdmin → return "Owner"
  fetch all page_acl_entries WHERE page_id = pageID
  fetch all group_members WHERE user_id = callerID → callerGroupIDs
  best = ""
  for each entry:
    if entry.subject_type == "user" AND entry.subject_id == callerID:
      best = max(best, entry.page_role)
    if entry.subject_type == "group" AND entry.subject_id in callerGroupIDs:
      best = max(best, entry.page_role)
  return best   // "" = no access (default deny)
```

### JWT structure

```jsonc
{
  "user_id": 42,
  "email": "alice@example.com",
  "workspace_role": "Member",
  "token_version": 3,      // must match users.token_version; incremented on logout
  "exp": 1893456000,
  "iat": 1893427200
}
```

Server-side invalidation: on logout or account deactivation, `users.token_version` is incremented. Any in-flight JWT with an older `token_version` is rejected by the Auth middleware on the next request.

### Secret encryption

```
Encrypt(plaintext, APP_SECRET):
  key    = SHA-256(APP_SECRET)              // 32 bytes
  nonce  = random 12 bytes
  cipher = AES-256-GCM(key)
  output = base64(nonce + cipher.Seal(nonce, plaintext))
  stored = "enc:" + output                  // prefix distinguishes encrypted from plain

Decrypt(stored, APP_SECRET):
  data   = base64_decode(stored[4:])        // strip "enc:" prefix
  nonce  = data[:12]
  cipher = data[12:]
  return AES-256-GCM(key).Open(nonce, cipher)
```

### Project structure

```
yantra/
├── backend/
│   ├── main.go              # Entry point — routes, embed FS, server start
│   ├── go.mod / go.sum
│   ├── config/
│   │   └── config.go        # Env var loading
│   ├── db/
│   │   └── db.go            # DB connection, AutoMigrate, IsSetupComplete()
│   ├── models/
│   │   ├── user.go          # User model + Can(permission) + role bundles
│   │   ├── group.go         # Group + GroupMember models
│   │   ├── page.go          # Page + PageACLEntry + ACL helpers
│   │   └── audit_log.go     # AuditLog model (append-only)
│   ├── middleware/
│   │   ├── auth.go          # JWT verify + IssueToken + RequirePermission
│   │   └── setup_check.go   # SetupGuard middleware
│   ├── handlers/
│   │   ├── setup.go         # GET /api/setup/status, POST /api/setup
│   │   ├── auth.go          # login, logout, change-password, admin reset
│   │   ├── users.go         # CRUD users, me
│   │   ├── groups.go        # Groups + membership management
│   │   ├── pages.go         # Pages CRUD + ACL + data/submit
│   │   ├── rest_executor.go # callRESTDataSource (HTTP client with secret decrypt)
│   │   └── audit.go         # ListAuditLogs + writeAuditLog (fire-and-forget)
│   ├── crypto/
│   │   └── crypto.go        # AES-256-GCM Encrypt/Decrypt
│   └── dist/                # React build output (embedded by go:embed in main.go)
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts       # Proxy /api → :8080 in dev; outDir → ../backend/dist
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx          # Router with protected/admin/public route guards
│       ├── api/client.ts    # Axios + JWT interceptor + 401 redirect
│       ├── store/auth.tsx   # AuthContext (token + user in localStorage)
│       ├── types/index.ts   # Shared TypeScript types
│       ├── components/
│       │   ├── Layout.tsx           # Shell with sidebar nav + header
│       │   └── ProtectedRoute.tsx   # Route guards
│       └── pages/
│           ├── Setup.tsx        # First-run setup wizard
│           ├── Login.tsx        # Login screen
│           ├── ChangePassword.tsx  # Forced + voluntary password change
│           ├── Profile.tsx      # User profile + change password
│           ├── admin/
│           │   ├── Users.tsx    # User management table + modals
│           │   ├── Groups.tsx   # Group management + member panel
│           │   ├── AuditLog.tsx # Filterable audit log table + pagination
│           │   └── Pages.tsx    # Page builder (list + create/edit form)
│           └── app/
│               ├── PageViewer.tsx    # Resolves page type → DataTable or Form
│               ├── DataTablePage.tsx # Fetches data, renders table
│               └── FormPage.tsx      # Renders form fields, submits
│
├── Dockerfile              # 3-stage: frontend build → Go build → alpine runtime
├── docker-compose.yml      # app + postgres services
├── .env.example            # All variables documented with defaults
├── .gitignore
├── LICENSE                 # AGPL-3.0
└── PRD/
    └── PRD_v0.3.md
```

---

## Development

### Prerequisites

- Go 1.22+
- Node 20+
- Docker + Docker Compose (for the database)
- PostgreSQL running locally, or use the bundled Docker service

### Run locally

```bash
# 1. Start PostgreSQL only
docker compose up postgres -d

# 2. Backend (in one terminal)
cd backend
cp ../.env.example ../.env   # edit APP_SECRET
go mod tidy
go run .

# 3. Frontend (in another terminal — proxies /api to :8080)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Build & test Docker image

```bash
docker compose build
docker compose up
```

### Adding a new permission

1. Add a constant to `backend/models/user.go` (or `group.go` / `page.go`)
2. Add it to the relevant role bundle in the same file
3. Guard the handler: `if !caller.Can(models.PermXxx) { ... }`
4. No migration needed — roles are in-memory bundles, not DB rows (V1)

---

## Roadmap

| Version | ETA | Highlights |
|---|---|---|
| **V1** (current) | now | Config-driven pages, RBAC, audit log, Docker deploy |
| **V1.1** | post-adoption | Google OAuth SSO, self-service password reset (SMTP) |
| **V2** | after V1 success | Visual drag-and-drop builder, plugin architecture, custom roles, SAML/OIDC |

See `PRD/PRD_v0.3.md` for the complete specification.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE). If you host Yantra as a service and make modifications, the AGPL requires you to publish those modifications. Contact us if you need a commercial license for embedding in a closed product.
