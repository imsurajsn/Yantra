package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/db"
)

// SetupGuard blocks all non-setup routes until the first Admin account exists.
// Attach this before the main router group so unauthenticated users are redirected
// to /setup on the frontend instead of receiving a 401.
func SetupGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Always allow: setup API, static assets, root
		if path == "/api/setup" ||
			path == "/api/setup/status" ||
			path == "/" {
			c.Next()
			return
		}

		if !db.IsSetupComplete() {
			// API requests get a JSON response; browser navigation gets a 302.
			if len(path) > 4 && path[:4] == "/api" {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
					"error":    "setup_required",
					"redirect": "/setup",
				})
			} else {
				c.Redirect(http.StatusFound, "/setup")
				c.Abort()
			}
			return
		}

		c.Next()
	}
}
