package services

import (
	"testing"
	"time"
)

func TestTokenService_SignParse_RoundTrip(t *testing.T) {
	ts, err := NewTokenService("token-test-app-secret")
	if err != nil {
		t.Fatalf("NewTokenService: %v", err)
	}

	token, err := ts.Sign(42, "session-abc", time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	userID, sessionID, err := ts.Parse(token)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if userID != 42 {
		t.Errorf("userID = %d, want 42", userID)
	}
	if sessionID != "session-abc" {
		t.Errorf("sessionID = %q, want %q", sessionID, "session-abc")
	}
}

func TestTokenService_Parse_RejectsExpiredToken(t *testing.T) {
	ts, _ := NewTokenService("token-test-app-secret")
	token, err := ts.Sign(1, "session-expired", time.Now().Add(-time.Minute))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if _, _, err := ts.Parse(token); err == nil {
		t.Fatal("expected Parse to reject an expired token, got nil error")
	}
}

func TestTokenService_Parse_RejectsTokenSignedWithDifferentSecret(t *testing.T) {
	a, _ := NewTokenService("secret-a")
	b, _ := NewTokenService("secret-b")

	token, err := a.Sign(1, "session-x", time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}

	if _, _, err := b.Parse(token); err == nil {
		t.Fatal("expected Parse with a different signing key to fail, got nil error")
	}
}
