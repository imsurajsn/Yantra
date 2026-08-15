package middleware

import (
	"net/http"
	"sync/atomic"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/gin-gonic/gin"
)

// SetupGuard blocks every route except the given allowlist (GET
// /setup/status, POST /setup) until at least one Admin account exists, per
// PRD: "on first launch with an empty database, all routes redirect to
// /setup." Once an Admin exists this becomes permanent — the guard caches
// that fact in memory (setupComplete only ever flips false->true, so an
// in-process atomic bool is safe and avoids a DB round trip on every
// request once setup is done).
type SetupGuard struct {
	users          *repositories.UserRepository
	allowedPaths   map[string]bool
	setupComplete  atomic.Bool
}

func NewSetupGuard(users *repositories.UserRepository, allowedPaths map[string]bool) *SetupGuard {
	return &SetupGuard{users: users, allowedPaths: allowedPaths}
}

// MarkComplete is called by the setup handler immediately after the first
// Admin is created, so the very next request (even before this handler's
// response is flushed) sees setup as done without a DB query.
func (g *SetupGuard) MarkComplete() {
	g.setupComplete.Store(true)
}

func (g *SetupGuard) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if g.setupComplete.Load() {
			c.Next()
			return
		}

		exists, err := g.users.AnyExists()
		if err != nil {
			apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to check setup status.")
			return
		}
		if exists {
			g.setupComplete.Store(true)
			c.Next()
			return
		}

		if g.allowedPaths[c.FullPath()] {
			c.Next()
			return
		}

		apierror.Send(c, http.StatusForbidden, "setup_required", "Initial setup has not been completed yet.")
	}
}
