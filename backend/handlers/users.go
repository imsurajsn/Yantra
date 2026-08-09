package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/middleware"
	"github.com/yantra-platform/yantra/models"
	"golang.org/x/crypto/bcrypt"
)

// GET /api/admin/users
func ListUsers(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceUsersCreate) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var users []models.User
	db.DB.Order("created_at ASC").Find(&users)
	c.JSON(http.StatusOK, gin.H{"data": users})
}

type createUserRequest struct {
	Email         string `json:"email" binding:"required,email"`
	DisplayName   string `json:"display_name" binding:"required"`
	Password      string `json:"password" binding:"required,min=8"`
	WorkspaceRole string `json:"workspace_role" binding:"required,oneof=Admin Member Viewer"`
}

// POST /api/admin/users
func CreateUser(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceUsersCreate) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	var existing models.User
	if db.DB.Where("email = ?", email).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "a user with this email already exists"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), config.C.BcryptCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user := models.User{
		Email:              email,
		DisplayName:        strings.TrimSpace(req.DisplayName),
		PasswordHash:       string(hash),
		WorkspaceRole:      req.WorkspaceRole,
		MustChangePassword: true,
		IsActive:           true,
	}
	if err := db.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, user)
}

// PATCH /api/admin/users/:id/role
func UpdateUserRole(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceUsersChangeRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var target models.User
	if err := db.DB.First(&target, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if target.ID == caller.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot change your own workspace role"})
		return
	}

	type roleReq struct {
		WorkspaceRole string `json:"workspace_role" binding:"required,oneof=Admin Member Viewer"`
	}
	var req roleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db.DB.Model(&target).Update("workspace_role", req.WorkspaceRole)
	c.JSON(http.StatusOK, gin.H{"message": "role updated"})
}

// PATCH /api/admin/users/:id/status
func UpdateUserStatus(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceUsersDeactivate) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var target models.User
	if err := db.DB.First(&target, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if target.ID == caller.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot deactivate your own account"})
		return
	}

	type statusReq struct {
		IsActive bool `json:"is_active"`
	}
	var req statusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{"is_active": req.IsActive}
	if !req.IsActive {
		// Increment token_version so any active sessions are immediately invalidated
		updates["token_version"] = target.TokenVersion + 1
	}
	db.DB.Model(&target).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}

// GET /api/me  — current user's own profile
func Me(c *gin.Context) {
	user := middleware.CurrentUser(c)
	c.JSON(http.StatusOK, user)
}
