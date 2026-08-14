# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend ----
# Output lands directly at backend/internal/webui/dist (see
# frontend/vite.config.ts's outDir) — Go's //go:embed can only reach files
# inside the embedding package's own directory tree, so the build output
# must land there directly rather than at a top-level backend/dist.
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: build the Go binary, embedding the frontend build ----
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend-builder /app/backend/internal/webui/dist ./internal/webui/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/yantra ./cmd/yantra

# ---- Stage 3: minimal runtime ----
# No Node, no Go toolchain — just the binary and CA certs (needed since
# page configs call arbitrary external REST endpoints over HTTPS).
FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates
COPY --from=backend-builder /out/yantra /usr/local/bin/yantra
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/yantra"]
