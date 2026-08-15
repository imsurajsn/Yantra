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
	Groups      *GroupHandler
	Pages       *PageHandler
	PageACL     *PageACLHandler
	PageRuntime *PageRuntimeHandler
	Audit       *AuditHandler
	Cookies     *CookieWriter
}

// RegisterRoutes wires the full /api/v1 tree.
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
			// Session-only, not workspace.users.view-gated (like GET /groups):
			// Group Admins need this to add members to their own group, and the
			// page-ACL "add subject" picker needs it too. Every mutation below
			// stays permission-gated.
			users.GET("", d.Users.List)
			users.POST("", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.create"), d.Users.Create)
			users.PATCH("/:id/role", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.change_role"), d.Users.ChangeRole)
			users.POST("/:id/deactivate", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.deactivate"), d.Users.Deactivate)
			users.POST("/:id/reactivate", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.deactivate"), d.Users.Reactivate)
			users.POST("/:id/reset-password", middleware.RequireWorkspacePermission(d.Perms, "workspace.users.reset_password"), d.Users.ResetPassword)
		}

		groups := authed.Group("/groups")
		{
			groups.GET("", d.Groups.List)
			groups.POST("", middleware.RequireWorkspacePermission(d.Perms, "workspace.groups.create"), d.Groups.Create)
			groups.GET("/:id", d.Groups.Get)
			groups.PATCH("/:id", d.Groups.Rename)
			groups.DELETE("/:id", d.Groups.Delete)
			groups.POST("/:id/members", d.Groups.AddMember)
			groups.DELETE("/:id/members/:user_id", d.Groups.RemoveMember)
			groups.PATCH("/:id/members/:user_id", d.Groups.ChangeMemberRole)
		}

		pages := authed.Group("/pages")
		{
			pages.GET("", d.Pages.List)
			pages.POST("/validate", middleware.RequireWorkspacePermission(d.Perms, "workspace.pages.create"), d.Pages.Validate)
			pages.POST("/preview", middleware.RequireWorkspacePermission(d.Perms, "workspace.pages.create"), d.Pages.Preview)
			pages.POST("", middleware.RequireWorkspacePermission(d.Perms, "workspace.pages.create"), d.Pages.Create)
			pages.GET("/:id", d.Pages.Get)
			pages.PATCH("/:id", d.Pages.Update)
			pages.DELETE("/:id", d.Pages.Delete)

			pages.GET("/:id/acl", d.PageACL.List)
			pages.POST("/:id/acl", d.PageACL.Add)
			pages.DELETE("/:id/acl/:acl_id", d.PageACL.Remove)

			pages.POST("/:id/view", d.PageRuntime.View)
			pages.GET("/:id/data", d.PageRuntime.Data)
			pages.PATCH("/:id/data/:row_id", d.PageRuntime.Writeback)
			pages.POST("/:id/submit", d.PageRuntime.Submit)
		}

		authed.GET("/audit-log", middleware.RequireWorkspacePermission(d.Perms, "workspace.audit.view"), d.Audit.List)
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
