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
	MustChangePassword bool       `gorm:"not null;default:true"`
	IsActive           bool       `gorm:"not null;default:true"`
	LastLoginAt        *time.Time
	CreatedByID        *uint // FK users(id), nullable — null for the first-run setup admin
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
