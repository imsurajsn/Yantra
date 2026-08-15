package middleware

// SessionCookieName is the httpOnly cookie carrying the signed JWT. JS never
// reads this — the frontend only ever sees the parsed /auth/me response.
const SessionCookieName = "yantra_session"

// CSRFHeaderName must be present on every mutating request. A cross-site
// form submission cannot set custom headers, so this plus SameSite=Lax on
// the cookie is the CSRF defense (no separate CSRF token needed).
const CSRFHeaderName = "X-Yantra-Request"

// ContextUserKey is where AuthRequired stores the authenticated
// *models.User for downstream handlers.
const ContextUserKey = "yantra_user"

// ContextSessionIDKey is where AuthRequired stores the session's jti, so
// /auth/logout can revoke exactly this session without re-parsing the token.
const ContextSessionIDKey = "yantra_session_id"
