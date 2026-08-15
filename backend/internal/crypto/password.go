package crypto

import "golang.org/x/crypto/bcrypt"

// bcryptCost is fixed at 12 per the PRD — not configurable, so it can never
// be silently weakened by a stray env var.
const bcryptCost = 12

// HashPassword bcrypt-hashes a plaintext password at the PRD-mandated cost.
func HashPassword(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword reports whether plaintext matches the given bcrypt hash.
func VerifyPassword(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}
