package services

import (
	"encoding/json"
	"testing"
)

func TestExtractItems_BareArrayPassesThroughWhenPathEmpty(t *testing.T) {
	in := json.RawMessage(`[{"id":1},{"id":2}]`)
	out, err := ExtractItems(in, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var got []map[string]int
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("output is not a valid array: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 items, got %d", len(got))
	}
}

func TestExtractItems_ObjectWithoutPathIsAnError(t *testing.T) {
	in := json.RawMessage(`{"users":[{"id":1}]}`)
	if _, err := ExtractItems(in, ""); err == nil {
		t.Fatal("expected an error when response is an object but items_path is empty")
	}
}

func TestExtractItems_SingleSegmentPath(t *testing.T) {
	in := json.RawMessage(`{"users":[{"id":1},{"id":2},{"id":3}]}`)
	out, err := ExtractItems(in, "users")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var got []map[string]int
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("output is not a valid array: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 items, got %d", len(got))
	}
}

func TestExtractItems_NestedDotPath(t *testing.T) {
	in := json.RawMessage(`{"data":{"items":[{"id":1}]}}`)
	out, err := ExtractItems(in, "data.items")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var got []map[string]int
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("output is not a valid array: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 item, got %d", len(got))
	}
}

func TestExtractItems_MissingKeyIsAnError(t *testing.T) {
	in := json.RawMessage(`{"users":[]}`)
	if _, err := ExtractItems(in, "results"); err == nil {
		t.Fatal("expected an error for a missing key")
	}
}

func TestExtractItems_PathResolvesToNonArrayIsAnError(t *testing.T) {
	in := json.RawMessage(`{"user":{"id":1}}`)
	if _, err := ExtractItems(in, "user"); err == nil {
		t.Fatal("expected an error when the path resolves to an object, not an array")
	}
}

func TestExtractItems_IntermediateSegmentNotAnObjectIsAnError(t *testing.T) {
	in := json.RawMessage(`{"users":[1,2,3]}`)
	if _, err := ExtractItems(in, "users.items"); err == nil {
		t.Fatal("expected an error when a path segment is not an object")
	}
}
