package crypto

import "testing"

func TestAESGCM_EncryptDecrypt_RoundTrip(t *testing.T) {
	aead, err := NewAESGCM("test-app-secret-does-not-need-to-be-32-bytes-exactly")
	if err != nil {
		t.Fatalf("NewAESGCM: %v", err)
	}

	plaintext := "Bearer sk_live_abc123"
	blob, err := aead.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if string(blob) == plaintext {
		t.Fatal("ciphertext must not equal plaintext")
	}

	got, err := aead.Decrypt(blob)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if got != plaintext {
		t.Fatalf("round trip mismatch: got %q, want %q", got, plaintext)
	}
}

func TestAESGCM_DifferentSecrets_ProduceIncompatibleKeys(t *testing.T) {
	a, _ := NewAESGCM("secret-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	b, _ := NewAESGCM("secret-two-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")

	blob, err := a.Encrypt("secret value")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	if _, err := b.Decrypt(blob); err == nil {
		t.Fatal("expected decrypt with a different derived key to fail, got nil error")
	}
}

func TestAESGCM_Decrypt_RejectsTruncatedInput(t *testing.T) {
	aead, _ := NewAESGCM("some-app-secret")
	if _, err := aead.Decrypt([]byte("short")); err == nil {
		t.Fatal("expected ErrCiphertextTooShort for input shorter than the nonce size, got nil")
	}
}

func TestAESGCM_Decrypt_RejectsTamperedCiphertext(t *testing.T) {
	aead, _ := NewAESGCM("some-app-secret")
	blob, err := aead.Encrypt("original value")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	tampered := append([]byte(nil), blob...)
	tampered[len(tampered)-1] ^= 0xFF // flip a bit in the GCM tag

	if _, err := aead.Decrypt(tampered); err == nil {
		t.Fatal("expected tampered ciphertext to fail authentication, got nil error")
	}
}
