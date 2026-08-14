.PHONY: generate-secret dev-backend dev-frontend build-frontend build-backend build test test-backend test-frontend lint lint-backend lint-frontend up down

generate-secret:
	@./scripts/generate_secret.sh

## --- Local development (two processes: `make dev-backend` + `make dev-frontend`) ---

dev-backend:
	cd backend && go run ./cmd/yantra

dev-frontend:
	cd frontend && npm run dev

## --- Build ---

build-frontend:
	cd frontend && npm ci && npm run build

build-backend:
	cd backend && go build -o ../yantra ./cmd/yantra

# Full production-equivalent build: frontend first (embed target), then the
# Go binary that embeds it — mirrors the Dockerfile's two stages.
build: build-frontend build-backend

## --- Tests ---

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm ci && npm run test

test: test-backend test-frontend

## --- Lint ---

lint-backend:
	cd backend && golangci-lint run

lint-frontend:
	cd frontend && npm run lint && npm run typecheck

lint: lint-backend lint-frontend

## --- Docker Compose ---

up:
	docker compose up --build

down:
	docker compose down
