package models

import (
	"time"

	"gorm.io/datatypes"
)

// Setting is a simple key/value store for low-risk, admin-editable config
// (default_page_size, session_inactivity_minutes override, workspace
// display name). TRUSTED_PROXIES is deliberately NEVER stored here — it
// stays env/config-file only, because a compromised Admin account widening
// its own trust boundary via this API would be a privilege-escalation
// vector for audit-log IP spoofing.
type Setting struct {
	Key         string `gorm:"primaryKey;size:100"`
	Value       datatypes.JSON
	UpdatedByID *uint
	UpdatedAt   time.Time
}
