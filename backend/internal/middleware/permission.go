package middleware

import (
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

// RequireWorkspacePermission is the standard factory for gating a
// workspace-scoped route: `router.POST("/users", RequireWorkspacePermission(perms, "workspace.users.create"), handler)`.
// It must run after AuthRequired. This — never a `user.Role.Key == "admin"`
// string comparison anywhere in a handler — is the only way handlers check
// workspace permissions, so V2 custom roles need zero handler changes.
func RequireWorkspacePermission(perms *services.PermissionService, permissionKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := CurrentUser(c)
		ok, err := perms.CanWorkspace(user, permissionKey)
		if err != nil {
			apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
			return
		}
		if !ok {
			apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "You do not have permission to perform this action.")
			return
		}
		c.Next()
	}
}
