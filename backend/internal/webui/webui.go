// Package webui embeds the compiled React frontend into the Go binary, so
// production deployments need no Node runtime and ship as one process, one
// Docker image (per the PRD's single-binary architecture).
//
// "all:dist" (not "dist") is required, not stylistic: go:embed silently
// skips files/directories starting with "." or "_" unless the "all:"
// prefix is used, and this package's compile-time placeholder is
// dist/.gitkeep — without "all:", a fresh checkout before the frontend has
// ever been built would fail to compile at all.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// Assets returns the embedded frontend build rooted at "dist" — so
// index.html reads as the FS root, not "dist/index.html". Before the
// frontend has been built (see frontend/vite.config.ts's outDir), this
// contains only the placeholder .gitkeep and no index.html; the server
// handles that by simply 404ing non-API routes until a real build lands.
func Assets() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
