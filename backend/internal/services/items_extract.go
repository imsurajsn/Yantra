package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ExtractItems returns the JSON array located at dotPath within raw JSON
// response data. An empty dotPath means data itself must already be the
// array — the backward-compatible default for pages configured before this
// field existed. dotPath navigates nested objects, e.g. "users" or
// "data.items". Returns a clear, actionable error rather than an array when
// the path doesn't resolve, so a misconfigured items_path is caught at
// validate/preview time instead of crashing the runtime table viewer.
func ExtractItems(data json.RawMessage, dotPath string) (json.RawMessage, error) {
	dotPath = strings.TrimSpace(dotPath)
	if dotPath == "" {
		var arr []json.RawMessage
		if err := json.Unmarshal(data, &arr); err != nil {
			return nil, fmt.Errorf("response is not a JSON array — set items_path to the key that contains the array")
		}
		return data, nil
	}

	var cur interface{}
	if err := json.Unmarshal(data, &cur); err != nil {
		return nil, fmt.Errorf("response is not valid JSON")
	}

	for _, seg := range strings.Split(dotPath, ".") {
		obj, ok := cur.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("items_path %q: %q is not an object in the response", dotPath, seg)
		}
		val, ok := obj[seg]
		if !ok {
			return nil, fmt.Errorf("items_path %q: key %q not found in the response", dotPath, seg)
		}
		cur = val
	}

	arr, ok := cur.([]interface{})
	if !ok {
		return nil, fmt.Errorf("items_path %q does not point to an array in the response", dotPath)
	}
	out, err := json.Marshal(arr)
	if err != nil {
		return nil, fmt.Errorf("internal error encoding extracted items")
	}
	return out, nil
}
