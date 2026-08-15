package models

import "time"

// User is never hard-deleted in V1 — only deactivated (IsActive=false).
// This lets every other table's FK to users.id stay a plain foreign key
// without worrying about orphaned rows; audit_log additionally denormalizes
// actor_email as a defensive snapshot (see AuditLog).
type User struct {
	ID                 uint       `gorm:"primaryKey"`
	Email              string     `gorm:"uniqueIndex;not null;size:255"`
	DisplayName        string     `gorm:"not null;size:150"`
	PasswordHash       string     `gorm:"not null"`
	RoleID             uint       `gorm:"not null"` // FK roles(id), workspace-scoped role
	Role               Role       `gorm:"foreignKey:RoleID;constraint:OnDelete:RESTRICT"`
	// No `default:true` tag on MustChangePassword: GORM silently omits a
	// field from its INSERT when the Go value is that type's zero value
	// (false) AND the field has a `default:` tag — letting the DB default
	// apply instead. UserService.createUser always sets this explicitly
	// (false for the first-run Admin, true for admin-created users), so the
	// application, not the DB column default, must be the source of truth.
	MustChangePassword bool `gorm:"not null"`
	IsActive           bool `gorm:"not null;default:true"`
	LastLoginAt        *time.Time
	CreatedByID        *uint // FK users(id), nullable — null for the first-run setup admin
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
