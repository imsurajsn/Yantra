package handlers

import (
	"net/http"
	"time"

	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/gin-gonic/gin"
)

// CookieWriter centralizes the session cookie's attributes so every issuing
// call site (setup, login) agrees on them. httpOnly + Secure + SameSite=Lax
// is the whole "JWT delivery" design: JS never touches the token at all.
type CookieWriter struct {
	// Secure controls the cookie's Secure flag. False only for local
	// plain-HTTP development; true in every real deployment (the app
	// assumes a TLS-terminating reverse proxy in front, per the PRD).
	Secure bool
}

func NewCookieWriter(secure bool) *CookieWriter {
	return &CookieWriter{Secure: secure}
}

func (w *CookieWriter) SetSession(c *gin.Context, token string, expiresAt time.Time) {
	maxAge := int(time.Until(expiresAt).Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookieName, token, maxAge, "/", "", w.Secure, true)
}

func (w *CookieWriter) ClearSession(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(middleware.SessionCookieName, "", -1, "/", "", w.Secure, true)
}
