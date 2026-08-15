package services

import "testing"

func TestRedactSensitiveFields(t *testing.T) {
	input := map[string]interface{}{
		"order_id": "ORD-123",
		"reason":   "customer complaint with private details",
		"amount":   42.5,
	}
	sensitive := map[string]bool{"reason": true}

	out := RedactSensitiveFields(input, sensitive)

	if out["reason"] != redacted {
		t.Errorf(`reason = %v, want %q`, out["reason"], redacted)
	}
	if out["order_id"] != "ORD-123" {
		t.Errorf("order_id should be unchanged, got %v", out["order_id"])
	}
	if out["amount"] != 42.5 {
		t.Errorf("amount should be unchanged, got %v", out["amount"])
	}

	// The input map itself must be untouched — callers must use the
	// returned map, never assume redaction happened in place.
	if input["reason"] == redacted {
		t.Fatal("RedactSensitiveFields must not mutate its input map")
	}
}

func TestRedactSensitiveFields_NoSensitiveKeys_ReturnsEquivalentCopy(t *testing.T) {
	input := map[string]interface{}{"a": 1, "b": "two"}
	out := RedactSensitiveFields(input, map[string]bool{})

	if len(out) != len(input) || out["a"] != 1 || out["b"] != "two" {
		t.Fatalf("expected an unmodified copy, got %#v", out)
	}
}
