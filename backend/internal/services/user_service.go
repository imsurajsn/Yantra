package services

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	appcrypto "github.com/imsurajsn/yantra/internal/crypto"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrEmailTaken     = errors.New("user: email already in use")
	ErrLastAdmin      = errors.New("user: cannot deactivate the last remaining Admin")
	ErrWrongPassword  = errors.New("user: current password is incorrect")
	ErrNotFirstLogin  = errors.New("user: password change is not pending for this account")
)

type UserService struct {
	db       *gorm.DB
	users    *repositories.UserRepository
	roles    *repositories.RoleRepository
	sessions *repositories.SessionRepository
}

func NewUserService(db *gorm.DB, users *repositories.UserRepository, roles *repositories.RoleRepository, sessions *repositories.SessionRepository) *UserService {
	return &UserService{db: db, users: users, roles: roles, sessions: sessions}
}

// CreateFirstAdmin backs POST /setup. It is only ever called by the setup
// handler, which itself only runs while SetupGuard reports no Admin exists
// yet — CreatedByID is left nil since there is no admin to attribute it to.
func (s *UserService) CreateFirstAdmin(email, displayName, password string) (*models.User, error) {
	adminRole, err := s.roles.FindByKey(models.RoleAdmin)
	if err != nil {
		return nil, fmt.Errorf("user: load admin role: %w", err)
	}
	return s.createUser(email, displayName, password, adminRole.ID, nil, false)
}

// CreateUser backs POST /users (workspace.users.create). The account is
// always created with must_change_password=true, per PRD requirement 40 —
// the admin-set initial password must be replaced on first login.
func (s *UserService) CreateUser(email, displayName, password, roleKey string, createdByID uint) (*models.User, error) {
	role, err := s.roles.FindByKey(roleKey)
	if err != nil {
		return nil, fmt.Errorf("user: unknown role %q: %w", roleKey, err)
	}
	id := createdByID
	return s.createUser(email, displayName, password, role.ID, &id, true)
}

func (s *UserService) createUser(email, displayName, password string, roleID uint, createdByID *uint, mustChangePassword bool) (*models.User, error) {
	if _, err := s.users.FindByEmail(email); err == nil {
		return nil, ErrEmailTaken
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	hash, err := appcrypto.HashPassword(password)
	if err != nil {
		return nil, err
	}

	u := &models.User{
		Email:               email,
		DisplayName:         displayName,
		PasswordHash:        hash,
		RoleID:              roleID,
		MustChangePassword:  mustChangePassword,
		IsActive:            true,
		CreatedByID:         createdByID,
	}
	if err := s.users.Create(u); err != nil {
		return nil, err
	}
	// Reload with Role preloaded — a bare Create() leaves the Role
	// association zero-valued, and callers (setup/create-user handlers)
	// build their API response directly from the returned user, which
	// otherwise ships an empty "role" field.
	return s.users.FindByID(u.ID)
}

// GenerateTempPassword produces a human-shareable one-time password for
// admin-managed resets/creation (PRD: "Admin cannot view existing
// passwords" — this is the value shown to the admin exactly once, at
// creation time, to hand off out-of-band). Uses crypto/rand, not math/rand
// — this value is a real credential, even if short-lived.
func GenerateTempPassword() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	b := make([]byte, 12)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			// crypto/rand failing means the OS entropy source is broken —
			// there is no safe fallback to a temp password generator.
			panic("user: crypto/rand unavailable: " + err.Error())
		}
		b[i] = alphabet[n.Int64()]
	}
	return string(b)
}

// ResetPassword backs POST /users/:id/reset-password: sets a new temp
// password, forces must_change_password, and revokes every existing
// session for that user (an old, possibly-compromised password's sessions
// must not survive the reset).
func (s *UserService) ResetPassword(userID uint) (tempPassword string, err error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return "", err
	}
	tempPassword = GenerateTempPassword()
	hash, err := appcrypto.HashPassword(tempPassword)
	if err != nil {
		return "", err
	}
	user.PasswordHash = hash
	user.MustChangePassword = true
	if err := s.users.Save(user); err != nil {
		return "", err
	}
	if err := s.sessions.RevokeAllForUser(userID); err != nil {
		return "", err
	}
	return tempPassword, nil
}

// SetPasswordOnFirstLogin backs POST /auth/set-first-login-password. Unlike
// ChangeOwnPassword, it does NOT require the current password: the user
// already proved they know it by successfully logging in with it moments
// earlier (that login is exactly what produced the session this endpoint
// requires) — matching the mockup's "Set a new password" screen, which has
// no current-password field. This is only safe because it is gated on
// MustChangePassword being true: it can never be used to silently rotate an
// already-settled account's password out from under a stolen-but-still-
// valid session, which is exactly what ChangeOwnPassword's re-verification
// exists to prevent for the normal (non-first-login) case.
func (s *UserService) SetPasswordOnFirstLogin(userID uint, newPassword string) error {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return err
	}
	if !user.MustChangePassword {
		return ErrNotFirstLogin
	}
	hash, err := appcrypto.HashPassword(newPassword)
	if err != nil {
		return err
	}
	user.PasswordHash = hash
	user.MustChangePassword = false
	if err := s.users.Save(user); err != nil {
		return err
	}
	return s.sessions.RevokeAllForUser(userID)
}

// ChangeOwnPassword backs POST /auth/change-password: requires the current
// password, then revokes every OTHER session for the user (the caller's own
// session is refreshed by the handler, not revoked out from under them).
func (s *UserService) ChangeOwnPassword(userID uint, currentPassword, newPassword string) error {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return err
	}
	if !appcrypto.VerifyPassword(user.PasswordHash, currentPassword) {
		return ErrWrongPassword
	}
	hash, err := appcrypto.HashPassword(newPassword)
	if err != nil {
		return err
	}
	user.PasswordHash = hash
	user.MustChangePassword = false
	if err := s.users.Save(user); err != nil {
		return err
	}
	return s.sessions.RevokeAllForUser(userID)
}

// Deactivate enforces "cannot deactivate the last remaining Admin" as a
// genuine data-layer guarantee: the active-Admin count check and the
// deactivation write happen inside one row-locked transaction, so two
// concurrent deactivation requests can't both pass the check and leave zero
// Admins (PRD requirement 42).
func (s *UserService) Deactivate(userID uint) error {
	adminRole, err := s.roles.FindByKey(models.RoleAdmin)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		var target models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&target, userID).Error; err != nil {
			return err
		}

		if target.RoleID == adminRole.ID && target.IsActive {
			var activeAdmins int64
			if err := tx.Model(&models.User{}).
				Where("role_id = ? AND is_active = ?", adminRole.ID, true).
				Count(&activeAdmins).Error; err != nil {
				return err
			}
			if activeAdmins <= 1 {
				return ErrLastAdmin
			}
		}

		target.IsActive = false
		if err := tx.Save(&target).Error; err != nil {
			return err
		}
		return tx.Model(&models.Session{}).
			Where("user_id = ? AND revoked_at IS NULL", userID).
			Update("revoked_at", time.Now()).Error
	})
}

func (s *UserService) Reactivate(userID uint) error {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return err
	}
	user.IsActive = true
	return s.users.Save(user)
}

// ChangeRole applies the same last-Admin protection as Deactivate: demoting
// the workspace's only active Admin to Member/Viewer would leave zero
// Admins just as surely as deactivating them would, so it gets the same
// row-locked-transaction guard.
func (s *UserService) ChangeRole(userID uint, roleKey string) (*models.User, error) {
	newRole, err := s.roles.FindByKey(roleKey)
	if err != nil {
		return nil, err
	}
	adminRole, err := s.roles.FindByKey(models.RoleAdmin)
	if err != nil {
		return nil, err
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		var target models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&target, userID).Error; err != nil {
			return err
		}

		if target.RoleID == adminRole.ID && newRole.ID != adminRole.ID && target.IsActive {
			var activeAdmins int64
			if err := tx.Model(&models.User{}).
				Where("role_id = ? AND is_active = ?", adminRole.ID, true).
				Count(&activeAdmins).Error; err != nil {
				return err
			}
			if activeAdmins <= 1 {
				return ErrLastAdmin
			}
		}

		target.RoleID = newRole.ID
		return tx.Save(&target).Error
	})
	if err != nil {
		return nil, err
	}
	return s.users.FindByID(userID)
}

func (s *UserService) List() ([]models.User, error) {
	return s.users.List()
}
