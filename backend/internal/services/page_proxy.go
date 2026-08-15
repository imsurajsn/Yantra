package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// proxyClient is shared across every outbound call to a page's configured
// external endpoint. A bounded timeout matters here specifically: this
// client calls URLs an admin configured, which could be slow, unreachable,
// or (accidentally or not) pointed at something that hangs — a stuck
// upstream must not tie up a request goroutine indefinitely.
var proxyClient = &http.Client{Timeout: 15 * time.Second}

// ProxyRequest performs one outbound HTTP call to a page's configured
// endpoint and decodes a JSON response. Shared by the preview endpoint
// (GET only), the table data-fetch and writeback endpoints, and form
// submission — every place Yantra calls out to a REST API the admin
// configured, per the PRD's "pages talk to REST APIs only" architecture.
func ProxyRequest(method, url string, headers map[string]string, body interface{}) (json.RawMessage, int, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("encode request body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := proxyClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5MB cap
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	// Not every upstream returns valid JSON on error paths — surface the
	// raw body as a JSON string rather than failing the whole call, so the
	// caller (and ultimately the admin) can still see what came back.
	if !json.Valid(respBody) {
		encoded, _ := json.Marshal(string(respBody))
		return json.RawMessage(encoded), resp.StatusCode, nil
	}
	return json.RawMessage(respBody), resp.StatusCode, nil
}
