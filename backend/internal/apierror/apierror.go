// Package apierror gives every handler one consistent error response shape:
// {"error": {"code": "...", "message": "..."}}.
package apierror

import "github.com/gin-gonic/gin"

type body struct {
	Error detail `json:"error"`
}

type detail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Send writes the standard error envelope with the given HTTP status.
func Send(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, body{Error: detail{Code: code, Message: message}})
}

// Common codes used across handlers — kept centralized so the frontend can
// switch on a stable, documented set rather than free-text messages.
const (
	CodeInvalidCredentials = "invalid_credentials"
	CodeUnauthorized       = "unauthorized"
	CodeForbidden          = "forbidden"
	CodeNotFound           = "not_found"
	CodeConflict           = "conflict"
	CodeValidation         = "validation_error"
	CodeSetupComplete      = "setup_already_complete"
	CodeInternal           = "internal_error"
)
