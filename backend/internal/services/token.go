package services

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/hkdf"
)

// TokenService signs and verifies the JWT carried in the httpOnly session
// cookie. The JWT is deliberately NOT the sole source of truth for whether a
// session is valid — every request also checks the Session row in the DB
// (see SessionRepository.FindActive) so that sign-out and password-change
// can truly revoke access server-side, per PRD requirement 10.
type TokenService struct {
	signingKey []byte
}

// claims is intentionally minimal: user_id + jti (session id) + standard
// exp. No role/permissions are embedded here — those are always re-read
// from the DB on every request, so a role change takes effect on the very
// next request rather than waiting for token expiry.
type claims struct {
	UserID uint `json:"uid"`
	jwt.RegisteredClaims
}

var ErrInvalidToken = errors.New("token: invalid or expired")

// NewTokenService derives a signing key from APP_SECRET via HKDF-SHA256,
// using a distinct "info" string from the AES-256-GCM key derivation in
// internal/crypto — the same root secret must never produce the same
// derived key for two different purposes.
func NewTokenService(appSecret string) (*TokenService, error) {
	key := make([]byte, 32)
	kdf := hkdf.New(sha256.New, []byte(appSecret), nil, []byte("yantra-jwt-signing-v1"))
	if _, err := io.ReadFull(kdf, key); err != nil {
		return nil, err
	}
	return &TokenService{signingKey: key}, nil
}

func (t *TokenService) Sign(userID uint, sessionID string, expiresAt time.Time) (string, error) {
	c := claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        sessionID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return token.SignedString(t.signingKey)
}

// Parse verifies the signature and expiry and returns (userID, sessionID).
// It does NOT check the DB session row — callers (middleware/auth.go) must
// still do that.
func (t *TokenService) Parse(tokenString string) (userID uint, sessionID string, err error) {
	var c claims
	parsed, err := jwt.ParseWithClaims(tokenString, &c, func(tok *jwt.Token) (interface{}, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("token: unexpected signing method %v", tok.Header["alg"])
		}
		return t.signingKey, nil
	})
	if err != nil || !parsed.Valid {
		return 0, "", ErrInvalidToken
	}
	return c.UserID, c.ID, nil
}
