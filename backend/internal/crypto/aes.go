// Package crypto provides the two primitives Yantra needs to keep secrets
// out of plaintext: AES-256-GCM for page auth-header values at rest, and
// bcrypt for user passwords.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"

	"golang.org/x/crypto/hkdf"
)

// ErrCiphertextTooShort is returned when Decrypt is given fewer bytes than
// the AES-GCM nonce size — always a corrupt or truncated blob.
var ErrCiphertextTooShort = errors.New("crypto: ciphertext too short")

// AESGCM wraps a derived 256-bit key for encrypting/decrypting page auth
// header values. One instance is built once at boot from APP_SECRET and
// shared across the app — it holds no per-call state.
type AESGCM struct {
	gcm cipher.AEAD
}

// NewAESGCM derives a 256-bit key from appSecret via HKDF-SHA256 (never uses
// the raw secret bytes directly as a key) and builds the AES-GCM cipher.
// Deriving via HKDF means APP_SECRET doesn't have to be exactly 32 bytes —
// the app just refuses to start if it's unset or too short (see
// internal/config), independent of this derivation.
func NewAESGCM(appSecret string) (*AESGCM, error) {
	key := make([]byte, 32)
	kdf := hkdf.New(sha256.New, []byte(appSecret), nil, []byte("yantra-page-auth-header-v1"))
	if _, err := io.ReadFull(kdf, key); err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &AESGCM{gcm: gcm}, nil
}

// Encrypt returns nonce||ciphertext||tag as a single blob, ready to store in
// PageAuthHeader.EncryptedValue.
func (a *AESGCM) Encrypt(plaintext string) ([]byte, error) {
	nonce := make([]byte, a.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return a.gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// Decrypt reverses Encrypt. Returns an error (never partial plaintext) if
// the blob was truncated or the GCM tag doesn't verify.
func (a *AESGCM) Decrypt(blob []byte) (string, error) {
	nonceSize := a.gcm.NonceSize()
	if len(blob) < nonceSize {
		return "", ErrCiphertextTooShort
	}
	nonce, ciphertext := blob[:nonceSize], blob[nonceSize:]
	plaintext, err := a.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
