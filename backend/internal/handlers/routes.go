package handlers

import (
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

// Deps bundles everything RegisterRoutes needs to wire handlers + middleware
// together. Kept as one struct (rather than a long parameter list) since
// main.go is the only caller and it's already assembling all of these.
type Deps struct {
	SetupGuard  *middleware.SetupGuard
	AuthService *services.AuthService
	Perms       *services.PermissionService
	Setup       *SetupHandler
	Auth        *AuthHandler
	Cookies     *CookieWriter
}

// RegisterRoutes wires the full /api/v1 tree for this PR's vertical slice
// (setup + auth). Later PRs extend this same function with users/groups/
// pages/audit groups, reusing the same guard/auth/permission middleware.
func RegisterRoutes(router *gin.Engine, d Deps) {
	api := router.Group("/api/v1")
	api.Use(d.SetupGuard.Middleware())
	api.Use(middleware.RequireCSRFHeader())

	// Public, always reachable regardless of setup state.
	api.GET("/setup/status", d.Setup.GetStatus)
	api.POST("/setup", d.Setup.Submit)
	api.POST("/auth/login", d.Auth.Login)

	authed := api.Group("")
	authed.Use(middleware.AuthRequired(d.AuthService))
	{
		authed.POST("/auth/logout", d.Auth.Logout)
		authed.GET("/auth/me", d.Auth.Me)
		authed.POST("/auth/change-password", d.Auth.ChangePassword)
		authed.POST("/auth/set-first-login-password", d.Auth.SetFirstLoginPassword)
	}
}

// SetupAllowedPaths lists the routes SetupGuard must let through while no
// Admin exists yet. Gin's c.FullPath() returns the route PATTERN (e.g.
// "/api/v1/setup/status"), matching what's registered above.
func SetupAllowedPaths() map[string]bool {
	return map[string]bool{
		"/api/v1/setup/status": true,
		"/api/v1/setup":        true,
	}
}
