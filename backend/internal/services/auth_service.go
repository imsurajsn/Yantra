package services

import (
	"errors"
	"time"

	appcrypto "github.com/imsurajsn/yantra/internal/crypto"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrInvalidCredentials = errors.New("auth: invalid credentials")

// AuthService owns login/logout/session lifecycle. It never returns
// different errors for "email not found" vs "wrong password" — both
// collapse to ErrInvalidCredentials, per PRD requirement 5 (no
// user-enumeration signal).
type AuthService struct {
	users              *repositories.UserRepository
	sessions           *repositories.SessionRepository
	tokens             *TokenService
	audit              *AuditService
	sessionInactivity  time.Duration
}

func NewAuthService(users *repositories.UserRepository, sessions *repositories.SessionRepository, tokens *TokenService, audit *AuditService, sessionInactivityMinutes int) *AuthService {
	return &AuthService{
		users:             users,
		sessions:          sessions,
		tokens:            tokens,
		audit:             audit,
		sessionInactivity: time.Duration(sessionInactivityMinutes) * time.Minute,
	}
}

// LoginResult carries everything the handler needs to set the session
// cookie and return the /auth/login response body.
type LoginResult struct {
	User  *models.User
	Token string
	Expiry time.Time
}

// Login verifies credentials, and on success issues a new Session row + JWT.
// Failed attempts (unknown email OR wrong password) are audited identically
// as login_failed with the attempted email, per PRD requirement 5.
func (s *AuthService) Login(email, password, ip, userAgent string) (*LoginResult, error) {
	user, err := s.users.FindByEmail(email)
	if err != nil {
		_ = s.audit.RecordLoginFailed(email, ip, userAgent)
		return nil, ErrInvalidCredentials
	}
	if !appcrypto.VerifyPassword(user.PasswordHash, password) {
		_ = s.audit.RecordLoginFailed(email, ip, userAgent)
		return nil, ErrInvalidCredentials
	}
	if !user.IsActive {
		_ = s.audit.RecordLoginFailed(email, ip, userAgent)
		return nil, ErrInvalidCredentials
	}

	result, err := s.issueSession(user, ip, userAgent)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	user.LastLoginAt = &now
	if err := s.users.Save(user); err != nil {
		return nil, err
	}

	_ = s.audit.RecordLogin(user.Email, &user.ID, ip, userAgent)
	return result, nil
}

// IssueSession signs a fresh session for a user without re-checking their
// password. Used by: the setup flow (the first Admin is signed in
// immediately after account creation, matching the mockup's "create admin
// account & continue" flow) and the change-password flow (the caller
// already proved their identity via current_password, so they get a fresh
// cookie rather than being logged out by their own password change).
func (s *AuthService) IssueSession(user *models.User, ip, userAgent string) (*LoginResult, error) {
	return s.issueSession(user, ip, userAgent)
}

func (s *AuthService) issueSession(user *models.User, ip, userAgent string) (*LoginResult, error) {
	sessionID := uuid.NewString()
	expiresAt := time.Now().Add(s.sessionInactivity)

	session := &models.Session{
		ID:         sessionID,
		UserID:     user.ID,
		CreatedAt:  time.Now(),
		LastSeenAt: time.Now(),
		ExpiresAt:  expiresAt,
		IPAddress:  ip,
		UserAgent:  userAgent,
	}
	if err := s.sessions.Create(session); err != nil {
		return nil, err
	}

	token, err := s.tokens.Sign(user.ID, sessionID, expiresAt)
	if err != nil {
		return nil, err
	}

	return &LoginResult{User: user, Token: token, Expiry: expiresAt}, nil
}

// Authenticate is the core of the auth middleware: verify the JWT
// signature, then confirm the DB session is still active (not revoked, not
// expired) — the DB row is the actual source of truth. On success it slides
// the inactivity window forward.
func (s *AuthService) Authenticate(tokenString string) (*models.User, error) {
	userID, sessionID, err := s.tokens.Parse(tokenString)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	session, err := s.sessions.FindActive(sessionID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	user, err := s.users.FindByID(userID)
	if err != nil || !user.IsActive {
		return nil, ErrInvalidCredentials
	}

	// Throttle the write: only slide the window if it's been at least a
	// minute since the last touch, so a page full of requests doesn't
	// hammer the sessions table.
	if time.Since(session.LastSeenAt) > time.Minute {
		_ = s.sessions.Touch(sessionID, time.Now().Add(s.sessionInactivity))
	}

	return user, nil
}

// Logout revokes exactly the caller's own session (PRD requirement 10).
func (s *AuthService) Logout(user *models.User, sessionID, ip, userAgent string) error {
	if err := s.sessions.Revoke(sessionID); err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return s.audit.RecordLogout(user.Email, user.ID, ip, userAgent)
}

// SessionIDFromToken exposes the jti without a full Authenticate() round
// trip — used by the logout handler, which already has the user from
// middleware and only needs which session row to revoke.
func (s *AuthService) SessionIDFromToken(tokenString string) (string, error) {
	_, sessionID, err := s.tokens.Parse(tokenString)
	if err != nil {
		return "", err
	}
	return sessionID, nil
}
