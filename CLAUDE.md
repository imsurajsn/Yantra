# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yantra is an open-source, self-hosted internal-tool platform: RBAC, audit logging,
and SSO built in from day one. **V1 has no visual page builder** — pages (data
tables, forms) are defined via a YAML config editor in the admin UI, not
drag-and-drop. The full spec is [PRD/PRD_v0.3.md](PRD/PRD_v0.3.md); read it before
making product-shape decisions (permission model, page config schema, audit
requirements) that aren't obvious from the code.

Single process, single Docker image: the Go binary serves the REST API and the
compiled React app (embedded via `go:embed` at build time), talking to one
Postgres/MySQL/MariaDB database.

## Commands

```bash
make dev-backend       # go run ./cmd/yantra — API on :8080
make dev-frontend      # vite — :5173, proxies /api to :8080

make test              # backend + frontend
make test-backend      # cd backend && go test ./...
make test-frontend     # cd frontend && npm run test

make lint              # backend + frontend
make lint-backend      # golangci-lint run (config: backend/.golangci.yml)
make lint-frontend     # eslint + tsc --noEmit

make build              # build-frontend then build-backend (mirrors Dockerfile)
make up / make down     # docker compose up --build / down
```

Single test, single package:
```bash
cd backend && go test ./internal/services/... -run TestPermissionService_CanPage
cd frontend && npx vitest run src/components/Sidebar.test.tsx
```

Backend integration tests (permission resolution, last-Admin guard, etc.) need a
real Postgres and **skip themselves automatically** if `TEST_DB_DSN` is unset
(`internal/testutil/db.go`). To run them locally:
```bash
docker compose up -d db
TEST_DB_DSN="host=localhost user=yantra password=changeme dbname=yantra port=5432 sslmode=disable" \
  make test-backend
```
SQLite is deliberately never used as a test stand-in — it behaves too
differently from Postgres (JSON columns, locking) to actually verify what
production runs on.

CI (`.github/workflows/lint-and-test.yml`) runs backend lint+test, frontend
lint+typecheck+test, then a **boot smoke test**: builds the real binary, boots it
against a fresh Postgres, and drives setup → login → create group → list pages
over HTTP. AutoMigrate has no rollback, so this is the safety net that catches
schema/seed bugs before merge — not just "it compiles." Run it in your head
before touching `db/automigrate.go`, `db/seed.go`, or route registration.

A pre-commit hook (Husky + lint-staged, installed by `npm install` in
`frontend/`) lints/formats staged frontend files automatically.

## Architecture

```
backend/
├── cmd/yantra/main.go        Composition root: wires config → repos → services →
│                              handlers → routes → embedded frontend, in that order.
│                              Nothing else constructs this graph.
└── internal/
    ├── models/                GORM structs — the DB schema, source of truth
    ├── repositories/          One per table/aggregate, thin DB access, no business logic
    ├── services/              Business logic (auth, permissions, users, groups,
    │                          pages, page proxy, audit)
    ├── handlers/               HTTP layer — Gin handlers + RegisterRoutes (routes.go)
    ├── middleware/              auth, setup-guard, permission checks, CSRF, trusted proxy
    ├── crypto/                 AES-256-GCM (page auth-header secrets) + bcrypt (passwords)
    └── webui/                   go:embed wrapper serving the built frontend

frontend/src/
├── routes/                    One file per screen (admin/ has the config-editor screens)
├── components/                Shared UI (AppLayout, Sidebar, Dialog, PermissionGate)
└── lib/
    ├── api/                    One file per resource, thin fetch wrappers
    ├── auth/AuthContext.tsx    Session state
    └── routing/                ProtectedRoute, PermissionRoute, SetupGate
```

### Permission model — the one rule that matters

**Every access check goes through `user.Can("permission.string")` /
`PermissionService` (`internal/services/permission_service.go`).** Never compare
`user.Role.Key == "admin"` (or any role key) directly in a handler — that's
exactly the shortcut that would break V2's custom roles, which reuse this same
table with zero schema migration.

Three scopes, each resolved differently:
- **Workspace** (`CanWorkspace`) — single role per user, straight permission lookup.
- **Group** (`CanGroup`) — role from the user's membership row for that specific
  group. A workspace Admin does *not* automatically get group permissions this
  way; Admins act on groups via the separate `workspace.groups.manage_all`
  workspace permission, checked alongside `CanGroup` by the caller.
- **Page** (`CanPage` / `EffectivePageRole`) — Admins with `Role.BypassesPageACL`
  bypass PageACL entirely. Otherwise the effective role is the **highest rank**
  (`RankPageViewer < RankPageEditor < RankPageOwner`, `models/role.go`) across the
  user's direct ACL entry and every group they belong to. No match = default deny.

Route wiring pattern (`handlers/routes.go`): read-type endpoints are often
session-only gated (e.g. `GET /users`, `GET /groups` — Group Admins need the user
list to add members, the page-ACL picker needs it too); every mutation is gated
with `middleware.RequireWorkspacePermission(perms, "workspace.x.y")`.

### Page config (YAML) pipeline

`internal/services/page_config.go` is the whole story: admin writes YAML →
`ValidatePageYAML` parses + validates per `PageType` (table/form) → returns a
`ParsedPage` with typed config for the `/pages/preview` endpoint → on save,
`Config` (JSON) is stored on the `Page` row. `ToYAML` reverses this for the
"Edit config" flow. `Page` is deliberately one polymorphic table for both page
types (not per-type tables) — the home/sidebar nav lists everything together, and
type-specific validation already lives in this file, not the schema.

**Auth headers never round-trip through the YAML editor.** They're a separate
form in the UI, encrypted server-side into `PageAuthHeader` via
`internal/crypto` (AES-256-GCM, key derived from `APP_SECRET`) — this is a
deliberate deviation from the original mockup, which embedded them in the YAML
directly. Don't reintroduce that.

At runtime, every outbound call to a page's configured external endpoint —
preview, table data-fetch, writeback, form submit — goes through the single
`ProxyRequest` in `internal/services/page_proxy.go` (15s timeout, 5MB response
cap, non-JSON error bodies get wrapped as a JSON string rather than failing the
call outright).

### Config and secrets

All environment config is loaded and validated once, at boot, in
`internal/config/config.go` — nothing else should call `os.Getenv` directly.
`APP_SECRET` (min 32 chars) backs both JWT signing and the AES-256-GCM key; the
app hard-`log.Fatal`s at boot without it, on purpose (no safe partially-started
state). `TRUSTED_PROXIES` is env-only, never DB-editable — a compromised Admin
account must not be able to widen its own audit-log IP trust boundary.

### CSRF

Session cookie is `SameSite=Lax`; paired with `middleware.RequireCSRFHeader()`
(rejects any non-GET/HEAD request missing a custom header) that's the complete
CSRF defense — a cross-site form POST can't set a custom header. If you add a
new mutating endpoint, it's covered automatically by the `api` group middleware
in `routes.go`; the frontend API client must send that header on every mutation.

### Audit log

Populated by `services/audit_service.go`, read via `GET /audit-log`
(`workspace.audit.view`). There's deliberately no delete path anywhere in the
application layer — treat that as a hard invariant, not an oversight (see the
comment in `internal/testutil/db.go` on why tests don't clear it either). Form
fields marked `sensitive: true` in a page's config are redacted before being
written to the audit log (`SensitiveFieldKeys` in `page_config.go`).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- One PR per logical chunk (e.g. "auth + setup wizard", "RBAC + audit log"), not
  one PR per file.
- Backend errors go through `internal/apierror` for consistent API error shapes.
