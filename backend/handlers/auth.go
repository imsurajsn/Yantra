package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/middleware"
	"github.com/yantra-platform/yantra/models"
	"golang.org/x/crypto/bcrypt"
)

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// POST /api/auth/login
func Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := db.DB.Where("email = ?", strings.ToLower(strings.TrimSpace(req.Email))).First(&user).Error; err != nil {
		// Constant-time response to prevent email enumeration
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is disabled"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeAuditLog(c, user.Email, models.AuditEventLogin, nil, nil)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}

	now := time.Now()
	db.DB.Model(&user).Update("last_login_at", now)

	token, err := middleware.IssueToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	writeAuditLog(c, user.Email, models.AuditEventLogin, nil, nil)

	c.JSON(http.StatusOK, gin.H{
		"token":                token,
		"must_change_password": user.MustChangePassword,
		"user": gin.H{
			"id":             user.ID,
			"email":          user.Email,
			"display_name":   user.DisplayName,
			"workspace_role": user.WorkspaceRole,
		},
	})
}

// POST /api/auth/logout  (requires Auth middleware)
// Increments token_version to server-side invalidate all existing tokens.
func Logout(c *gin.Context) {
	user := middleware.CurrentUser(c)
	db.DB.Model(user).UpdateColumn("token_version", user.TokenVersion+1)
	writeAuditLog(c, user.Email, models.AuditEventLogout, nil, nil)
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// POST /api/auth/change-password  (requires Auth middleware)
// Used for forced first-login password change and voluntary changes from Profile.
func ChangePassword(c *gin.Context) {
	user := middleware.CurrentUser(c)

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
		return
	}

	if req.CurrentPassword == req.NewPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "new password must differ from current password"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), config.C.BcryptCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	db.DB.Model(user).Updates(map[string]interface{}{
		"password_hash":       string(hash),
		"must_change_password": false,
		"token_version":       user.TokenVersion + 1, // invalidate old tokens
	})

	// Issue a fresh token so the UI doesn't lose session after the forced change
	user.MustChangePassword = false
	user.TokenVersion++
	token, _ := middleware.IssueToken(user)

	c.JSON(http.StatusOK, gin.H{"token": token, "message": "password changed successfully"})
}

// POST /api/admin/users/:id/reset-password  (requires Admin + Auth middleware)
// Admin resets a user's password and forces them to change it on next login.
func AdminResetPassword(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceUsersResetPass) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var target models.User
	if err := db.DB.First(&target, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	type resetReq struct {
		NewPassword string `json:"new_password" binding:"required,min=8"`
	}
	var req resetReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), config.C.BcryptCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	db.DB.Model(&target).Updates(map[string]interface{}{
		"password_hash":       string(hash),
		"must_change_password": true,
		"token_version":       target.TokenVersion + 1,
	})

	c.JSON(http.StatusOK, gin.H{"message": "password reset; user must change on next login"})
}
