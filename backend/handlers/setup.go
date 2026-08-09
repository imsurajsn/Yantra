package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/models"
	"golang.org/x/crypto/bcrypt"

	"github.com/yantra-platform/yantra/config"
)

// GET /api/setup/status
// Returns whether initial setup has been completed.
func SetupStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"setup_complete": db.IsSetupComplete()})
}

type setupRequest struct {
	Email       string `json:"email" binding:"required,email"`
	DisplayName string `json:"display_name" binding:"required"`
	Password    string `json:"password" binding:"required,min=8"`
}

// POST /api/setup
// Creates the first Admin user. Returns 409 if setup is already complete.
func Setup(c *gin.Context) {
	if db.IsSetupComplete() {
		c.JSON(http.StatusConflict, gin.H{"error": "setup has already been completed"})
		return
	}

	var req setupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), config.C.BcryptCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	admin := models.User{
		Email:              strings.ToLower(strings.TrimSpace(req.Email)),
		DisplayName:        strings.TrimSpace(req.DisplayName),
		PasswordHash:       string(hash),
		WorkspaceRole:      models.RoleAdmin,
		MustChangePassword: false, // Admin sets their own password during setup
		IsActive:           true,
		LastLoginAt:        func() *time.Time { t := time.Now(); return &t }(),
	}

	if err := db.DB.Create(&admin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create admin user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "workspace setup complete"})
}
