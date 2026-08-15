package repositories

import (
	"time"

	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type SessionRepository struct {
	db *gorm.DB
}

func NewSessionRepository(db *gorm.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(s *models.Session) error {
	return r.db.Create(s).Error
}

// FindActive returns the session only if it exists, is not revoked, and has
// not expired — the single check every authenticated request relies on.
func (r *SessionRepository) FindActive(id string) (*models.Session, error) {
	var s models.Session
	err := r.db.Where("id = ? AND revoked_at IS NULL AND expires_at > ?", id, time.Now()).First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Touch extends the sliding inactivity window. Callers should throttle this
// (e.g. only update if last_seen_at is more than a minute old) to avoid a
// write on every single request.
func (r *SessionRepository) Touch(id string, newExpiresAt time.Time) error {
	return r.db.Model(&models.Session{}).Where("id = ?", id).
		Updates(map[string]interface{}{"last_seen_at": time.Now(), "expires_at": newExpiresAt}).Error
}

// Revoke ends exactly one session (sign-out).
func (r *SessionRepository) Revoke(id string) error {
	now := time.Now()
	return r.db.Model(&models.Session{}).Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", now).Error
}

// RevokeAllForUser ends every active session for a user — used on password
// change/reset, per PRD: replacing a password must invalidate old sessions.
func (r *SessionRepository) RevokeAllForUser(userID uint) error {
	now := time.Now()
	return r.db.Model(&models.Session{}).Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error
}
