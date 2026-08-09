package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/models"
)

type Claims struct {
	UserID       uint   `json:"user_id"`
	Email        string `json:"email"`
	WorkspaceRole string `json:"workspace_role"`
	TokenVersion int    `json:"token_version"`
	jwt.RegisteredClaims
}

// IssueToken creates a signed JWT for the given user.
func IssueToken(user *models.User) (string, error) {
	expiry := time.Now().Add(time.Duration(config.C.SessionDurationHours) * time.Hour)
	claims := Claims{
		UserID:        user.ID,
		Email:         user.Email,
		WorkspaceRole: user.WorkspaceRole,
		TokenVersion:  user.TokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.C.AppSecret))
}

// Auth is a Gin middleware that validates the Bearer JWT and injects the user into context.
// It also rejects tokens whose TokenVersion is older than the current user record.
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid Authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(config.C.AppSecret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		// Validate token version (server-side invalidation on logout)
		var user models.User
		if err := db.DB.First(&user, claims.UserID).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		if !user.IsActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account is disabled"})
			return
		}
		if user.TokenVersion != claims.TokenVersion {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token has been invalidated"})
			return
		}

		c.Set("user", &user)
		c.Next()
	}
}

// RequirePermission returns a middleware that enforces a workspace-level permission.
func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := currentUser(c)
		if user == nil || !user.Can(permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}
		c.Next()
	}
}

// RequireAdmin is shorthand for the Admin workspace role check on admin-only routes.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := currentUser(c)
		if user == nil || !user.IsAdmin() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			return
		}
		c.Next()
	}
}

func currentUser(c *gin.Context) *models.User {
	val, exists := c.Get("user")
	if !exists {
		return nil
	}
	u, ok := val.(*models.User)
	if !ok {
		return nil
	}
	return u
}

// CurrentUser retrieves the authenticated user from the Gin context.
// Panics if called outside Auth() middleware — intended for handlers only.
func CurrentUser(c *gin.Context) *models.User {
	return c.MustGet("user").(*models.User)
}
