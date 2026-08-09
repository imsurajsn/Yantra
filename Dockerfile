# Stage 1 — Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build
# Output lands in /app/backend/dist (vite.config.ts: outDir: '../backend/dist')


# Stage 2 — Build Go binary (with embedded frontend assets)
FROM golang:1.22-alpine AS backend-build
WORKDIR /app
# Cache module downloads separately from source
COPY backend/go.mod backend/go.sum ./
RUN go mod download
# Copy source; dist/ is already produced by stage 1
COPY backend/ ./
COPY --from=frontend-build /app/backend/dist ./dist
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /yantra .


# Stage 3 — Minimal runtime image
FROM alpine:3.20
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=backend-build /yantra .
EXPOSE 8080
USER nobody
ENTRYPOINT ["./yantra"]
