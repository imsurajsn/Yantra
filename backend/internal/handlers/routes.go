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
	Users       *UserHandler
	Cookies     *CookieWriter
}

// RegisterRoutes wires the full /api/v1 tree. Groups/Pages/Audit routes
// follow the same guard/auth/permission middleware pattern established
// here, added in later PRs.
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

		users := authed.Group("/users")
		{
			users.GET("", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.view"), d.Users.List)
			users.POST("", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.create"), d.Users.Create)
			users.PATCH("/:id/role", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.change_role"), d.Users.ChangeRole)
			users.POST("/:id/deactivate", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.deactivate"), d.Users.Deactivate)
			users.POST("/:id/reactivate", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.deactivate"), d.Users.Reactivate)
			users.POST("/:id/reset-password", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.reset_password"), d.Users.ResetPassword)
		}
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
