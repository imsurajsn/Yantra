package middleware

import "github.com/gin-gonic/gin"

// ConfigureTrustedProxies wires Gin's built-in trusted-proxy handling —
// c.ClientIP() then only trusts X-Forwarded-For/X-Real-IP when the
// immediate peer is in this list, else falls back to the raw connection
// address. This is what makes audit-log IP addresses accurate when Yantra
// sits behind nginx/Caddy/Traefik for TLS termination (the PRD's assumed
// deployment shape) without hand-rolling XFF parsing, and without letting
// an untrusted client spoof its own IP by setting the header itself.
//
// TRUSTED_PROXIES is env-only (see internal/config) — never DB-editable,
// since widening it via the API would let a compromised Admin account spoof
// audit-log IPs.
func ConfigureTrustedProxies(router *gin.Engine, trustedProxies []string) error {
	if len(trustedProxies) == 0 {
		// No proxies configured: trust nothing, always use the raw
		// connection address. Safe default for a direct-exposed deployment.
		return router.SetTrustedProxies(nil)
	}
	return router.SetTrustedProxies(trustedProxies)
}
