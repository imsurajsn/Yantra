# Contributing

## Local development

```
make dev-backend    # runs the Go API on :8080
make dev-frontend    # runs Vite on :5173, proxying /api to :8080
```

Backend needs a Postgres to talk to — either run `docker compose up db` (just the
bundled DB service) or point `DB_DSN` in `backend/.env` at your own instance.

## Tests

```
make test            # backend + frontend
make test-backend    # go test ./...
make test-frontend    # npm run test
```

Backend integration tests (permission resolution, last-Admin guard, etc.) need a
real Postgres — they skip themselves automatically if `TEST_DB_DSN` isn't set. To
run them locally:

```
docker compose up -d db
TEST_DB_DSN="host=localhost user=yantra password=changeme dbname=yantra port=5432 sslmode=disable" \
  make test-backend
```

CI (`.github/workflows/lint-and-test.yml`) always sets `TEST_DB_DSN` and runs the
full suite.

## Lint

```
make lint             # backend + frontend
```

Backend: `golangci-lint` (config in `backend/.golangci.yml`). Frontend: ESLint +
Prettier + `tsc --noEmit`. A pre-commit hook (Husky + lint-staged, set up
automatically by `npm install` in `frontend/`) runs lint/format on staged
frontend files.

## Commits & PRs

- [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- One PR per logical chunk (e.g. "auth + setup wizard", "RBAC + audit log", "page
  primitives"), not one PR per file.
- RBAC rule: every access check goes through `user.Can("permission.string")`
  (`internal/services/permission_service.go`) — never compare a role key directly
  in a handler. This is what keeps V2 custom roles a data-only change.
