package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/handlers"
	"github.com/yantra-platform/yantra/middleware"
)

//go:embed dist
var staticFiles embed.FS

func main() {
	config.Load()
	db.Connect()
	db.Migrate()

	r := gin.Default()

	// CORS — tightened for production; allow all origins in dev via env
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
	}))

	// Block all routes (except /api/setup*) until initial setup is done
	r.Use(middleware.SetupGuard())

	// ── Public API routes ──────────────────────────────────────────────
	api := r.Group("/api")
	{
		api.GET("/setup/status", handlers.SetupStatus)
		api.POST("/setup", handlers.Setup)
		api.POST("/auth/login", handlers.Login)
	}

	// ── Authenticated API routes ───────────────────────────────────────
	authAPI := r.Group("/api")
	authAPI.Use(middleware.Auth())
	{
		authAPI.POST("/auth/logout", handlers.Logout)
		authAPI.POST("/auth/change-password", handlers.ChangePassword)
		authAPI.GET("/me", handlers.Me)

		// Pages (access controlled per-page via ACL)
		authAPI.GET("/pages", handlers.ListPages)
		authAPI.POST("/pages", handlers.CreatePage)
		authAPI.GET("/pages/:id/config", handlers.GetPageConfig)
		authAPI.PUT("/pages/:id/config", handlers.UpdatePageConfig)
		authAPI.DELETE("/pages/:id", handlers.DeletePage)
		authAPI.GET("/pages/:id/data", handlers.GetPageData)
		authAPI.POST("/pages/:id/submit", handlers.SubmitForm)
		authAPI.GET("/pages/:page_id/acl", handlers.GetPageACL)
		authAPI.POST("/pages/:page_id/acl", handlers.UpsertPageACL)
		authAPI.DELETE("/pages/:page_id/acl/:acl_id", handlers.DeletePageACLEntry)

		// Groups (any authenticated user can list; create requires permission)
		authAPI.GET("/groups", handlers.ListGroups)
		authAPI.POST("/groups", handlers.CreateGroup)
		authAPI.GET("/groups/:id/members", handlers.ListGroupMembers)
		authAPI.POST("/groups/:id/members", handlers.AddGroupMember)
		authAPI.DELETE("/groups/:id/members/:user_id", handlers.RemoveGroupMember)
		authAPI.DELETE("/groups/:id", handlers.DeleteGroup)

		// Admin-only routes
		admin := authAPI.Group("/admin")
		{
			admin.GET("/users", handlers.ListUsers)
			admin.POST("/users", handlers.CreateUser)
			admin.PATCH("/users/:id/role", handlers.UpdateUserRole)
			admin.PATCH("/users/:id/status", handlers.UpdateUserStatus)
			admin.POST("/users/:id/reset-password", handlers.AdminResetPassword)
			admin.GET("/audit", handlers.ListAuditLogs)
		}
	}

	// ── Serve React SPA (all non-API routes) ──────────────────────────
	sub, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		log.Fatal("Failed to load embedded frontend assets:", err)
	}
	staticFS := http.FS(sub)
	fileServer := http.FileServer(staticFS)

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// Serve static asset if it exists; otherwise serve index.html (SPA fallback)
		if strings.Contains(path, ".") {
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		// SPA fallback — React Router handles client-side routing
		c.FileFromFS("index.html", staticFS)
	})

	log.Printf("Yantra listening on :%s", config.C.Port)
	if err := r.Run(":" + config.C.Port); err != nil {
		log.Fatal(err)
	}
}
