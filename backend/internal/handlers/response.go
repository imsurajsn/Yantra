package handlers

import (
	"time"

	"github.com/imsurajsn/yantra/internal/models"
)

// userDTO is the shape returned for a user across setup/auth/user-management
// endpoints. Never includes PasswordHash — this is the single choke point
// that guarantees the hash never leaks into a response body.
type userDTO struct {
	ID                 uint       `json:"id"`
	Email              string     `json:"email"`
	DisplayName        string     `json:"display_name"`
	Role               string     `json:"role"`
	MustChangePassword bool       `json:"must_change_password"`
	IsActive           bool       `json:"is_active"`
	LastLoginAt        *time.Time `json:"last_login_at"`
}

func userResponse(u *models.User) userDTO {
	roleKey := u.Role.Key
	return userDTO{
		ID:                 u.ID,
		Email:              u.Email,
		DisplayName:        u.DisplayName,
		Role:               roleKey,
		MustChangePassword: u.MustChangePassword,
		IsActive:           u.IsActive,
		LastLoginAt:        u.LastLoginAt,
	}
}
