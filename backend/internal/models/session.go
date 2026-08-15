package models

import "time"

// Session is the server-side JWT invalidation mechanism. The JWT payload
// carries {user_id, jti=Session.ID, exp}; every authenticated request also
// validates this row (RevokedAt IS NULL AND ExpiresAt > now()) — the JWT
// signature alone is never sufficient. This is what makes real server-side
// sign-out possible (PRD requirement 10), unlike a stateless-JWT-only design.
type Session struct {
	ID         string `gorm:"primaryKey;size:36"` // UUID, embedded in the JWT as `jti`
	UserID     uint   `gorm:"not null;index"`
	User       User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time `gorm:"not null;index"` // sliding inactivity window
	RevokedAt  *time.Time
	IPAddress  string `gorm:"size:64"`
	UserAgent  string `gorm:"size:512"`
}
