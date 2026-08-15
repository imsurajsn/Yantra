package models

import (
	"time"

	"gorm.io/datatypes"
)

type AuditEventType string

const (
	EventLogin        AuditEventType = "login"
	EventLoginFailed  AuditEventType = "login_failed"
	EventLogout       AuditEventType = "logout"
	EventPageView     AuditEventType = "page_view"
	EventFormSubmit   AuditEventType = "form_submit"
	EventAPICall      AuditEventType = "api_call"
)

// AuditLog is structurally append-only, not just append-only by convention:
//   - This model has no UpdatedAt/DeletedAt fields and no gorm.Model embed.
//   - AuditRepository (see internal/repositories) exposes ONLY Create() and
//     Query() — Update/Delete methods do not exist anywhere in the codebase,
//     so calling one would be a compile error, not a runtime check.
//   - Deployment docs additionally recommend
//     `REVOKE UPDATE, DELETE ON audit_log FROM <app_db_role>` as
//     defense-in-depth for operators using a dedicated DB role.
//
// ActorEmail and PageTitleSnapshot are deliberately denormalized: a user or
// page can later be deactivated/deleted, but the audit trail must remain
// readable exactly as it happened.
type AuditLog struct {
	ID              uint64 `gorm:"primaryKey"`
	EventType       AuditEventType `gorm:"not null;size:30;index"`
	ActorUserID     *uint          `gorm:"index"` // nullable: failed login of an unknown email
	ActorEmail      string         `gorm:"not null;size:255"`
	PageID          *uint          `gorm:"index"`
	Page            *Page          `gorm:"foreignKey:PageID;constraint:OnDelete:SET NULL"`
	PageTitleSnapshot *string      `gorm:"size:200"`
	IPAddress       string         `gorm:"size:64"`
	UserAgent       string         `gorm:"size:512"`
	HTTPMethod      *string        `gorm:"size:10"`
	HTTPStatusCode  *int
	EventData       datatypes.JSON // sensitive fields already redacted to "[REDACTED]" before this row is ever constructed
	CreatedAt       time.Time      `gorm:"index"`
}
