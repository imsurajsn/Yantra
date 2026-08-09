package models

import "time"

// Audit event type constants
const (
	AuditEventLogin      = "login"
	AuditEventLogout     = "logout"
	AuditEventPageView   = "page_view"
	AuditEventFormSubmit = "form_submit"
	AuditEventAPICall    = "api_call"
)

// AuditLog is append-only. No UPDATE or DELETE routes exist for this model.
// The application layer enforces this — no GORM Update/Delete methods are called on AuditLog rows.
type AuditLog struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserEmail   string    `gorm:"index;not null" json:"user_email"`
	EventType   string    `gorm:"index;not null" json:"event_type"`
	PageID      *uint     `json:"page_id,omitempty"`
	IPAddress   string    `json:"ip_address,omitempty"`
	UserAgent   string    `json:"user_agent,omitempty"`
	Endpoint    string    `json:"endpoint,omitempty"`
	HTTPMethod  string    `json:"http_method,omitempty"`
	HTTPStatus  *int      `json:"http_status,omitempty"`
	FieldValues string    `gorm:"type:text" json:"field_values,omitempty"` // JSON; sensitive fields are "[REDACTED]"
	Timestamp   time.Time `gorm:"index;not null" json:"timestamp"`
}
