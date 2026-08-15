package middleware

import (
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

// AuthRequired reads the session cookie, verifies the JWT, and confirms the
// backing Session row is still active (see AuthService.Authenticate — the
// DB row, not just the JWT signature, is the real source of truth so
// sign-out and password-reset can genuinely revoke access). On success it
// stores the user and session id in context for downstream handlers.
func AuthRequired(auth *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(SessionCookieName)
		if err != nil || token == "" {
			apierror.Send(c, http.StatusUnauthorized, apierror.CodeUnauthorized, "Sign-in required.")
			return
		}

		user, err := auth.Authenticate(token)
		if err != nil {
			apierror.Send(c, http.StatusUnauthorized, apierror.CodeUnauthorized, "Session is invalid or has expired.")
			return
		}

		sessionID, err := auth.SessionIDFromToken(token)
		if err != nil {
			apierror.Send(c, http.StatusUnauthorized, apierror.CodeUnauthorized, "Session is invalid or has expired.")
			return
		}

		c.Set(ContextUserKey, user)
		c.Set(ContextSessionIDKey, sessionID)
		c.Next()
	}
}

// RequireCSRFHeader enforces CSRFHeaderName on mutating requests — paired
// with SameSite=Lax on the session cookie, this is the full CSRF defense
// (a cross-site form POST cannot set a custom header).
func RequireCSRFHeader() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			if c.GetHeader(CSRFHeaderName) == "" {
				apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "Missing required request header.")
				return
			}
		}
		c.Next()
	}
}

// CurrentUser reads the user AuthRequired stored in context. Panics if
// called without AuthRequired in the chain first — that's a routing bug,
// not a runtime condition to handle gracefully.
func CurrentUser(c *gin.Context) *models.User {
	return c.MustGet(ContextUserKey).(*models.User)
}

func CurrentSessionID(c *gin.Context) string {
	return c.MustGet(ContextSessionIDKey).(string)
}
