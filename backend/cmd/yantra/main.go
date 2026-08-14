// Command yantra is the single binary that serves both the REST API and
// the compiled React frontend (embedded via internal/webui) — one process,
// one Docker image, per the PRD's single-binary architecture.
package main

import (
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/imsurajsn/yantra/internal/config"
	"github.com/imsurajsn/yantra/internal/db"
	"github.com/imsurajsn/yantra/internal/handlers"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/imsurajsn/yantra/internal/webui"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	log.Printf("yantra: starting (%s)", cfg.String())

	gdb, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("yantra: %v", err)
	}
	if err := db.AutoMigrate(gdb); err != nil {
		log.Fatalf("yantra: %v", err)
	}
	if err := db.Seed(gdb); err != nil {
		log.Fatalf("yantra: %v", err)
	}

	// Repositories
	userRepo := repositories.NewUserRepository(gdb)
	roleRepo := repositories.NewRoleRepository(gdb)
	sessionRepo := repositories.NewSessionRepository(gdb)
	groupRepo := repositories.NewGroupRepository(gdb)
	pageACLRepo := repositories.NewPageACLRepository(gdb)
	auditRepo := repositories.NewAuditRepository(gdb)

	// Services
	tokenSvc, err := services.NewTokenService(cfg.AppSecret)
	if err != nil {
		log.Fatalf("yantra: %v", err)
	}
	auditSvc := services.NewAuditService(auditRepo)
	authSvc := services.NewAuthService(userRepo, sessionRepo, tokenSvc, auditSvc, cfg.SessionInactivityMins)
	userSvc := services.NewUserService(gdb, userRepo, roleRepo, sessionRepo)
	permSvc := services.NewPermissionService(roleRepo, groupRepo, pageACLRepo)
	_ = permSvc // wired for later route groups (users/groups/pages) added in subsequent PRs

	// Middleware
	setupGuard := middleware.NewSetupGuard(userRepo, handlers.SetupAllowedPaths())

	// Handlers
	cookies := handlers.NewCookieWriter(cookieSecure())
	setupHandler := handlers.NewSetupHandler(userRepo, userSvc, authSvc, setupGuard, cookies)
	authHandler := handlers.NewAuthHandler(authSvc, userSvc, groupRepo, roleRepo, cookies)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	if err := middleware.ConfigureTrustedProxies(router, cfg.TrustedProxies); err != nil {
		log.Fatalf("yantra: configure trusted proxies: %v", err)
	}

	handlers.RegisterRoutes(router, handlers.Deps{
		SetupGuard:  setupGuard,
		AuthService: authSvc,
		Perms:       permSvc,
		Setup:       setupHandler,
		Auth:        authHandler,
		Cookies:     cookies,
	})

	if err := mountFrontend(router); err != nil {
		log.Printf("yantra: warning: frontend assets not mounted: %v", err)
	}

	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("yantra: server exited: %v", err)
	}
}

// cookieSecure reads COOKIE_SECURE (default "true"). Only ever set to
// "false" for local plain-HTTP development — every real deployment sits
// behind TLS per the PRD's assumed reverse-proxy shape.
func cookieSecure() bool {
	return os.Getenv("COOKIE_SECURE") != "false"
}

// mountFrontend serves the embedded React build for every route the /api/v1
// group didn't claim, with an SPA fallback to index.html for client-side
// routing (setup/login/home/etc. are all client routes). Before a frontend
// build has ever run (fresh checkout, Go-only CI job), Assets() has no
// index.html and this simply results in 404s for non-API routes — the API
// itself still works.
func mountFrontend(router *gin.Engine) error {
	assets, err := webui.Assets()
	if err != nil {
		return err
	}
	if _, err := fs.Stat(assets, "index.html"); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return errors.New("no frontend build found (run the frontend build before starting in production)")
		}
		return err
	}

	fileServer := http.FileServerFS(assets)
	router.NoRoute(func(c *gin.Context) {
		if _, err := fs.Stat(assets, c.Request.URL.Path[1:]); err != nil {
			// Not a real static asset (e.g. "/home", a client-side route) —
			// serve index.html and let the SPA router take over.
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
	return nil
}
