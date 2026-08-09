package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/crypto"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

// callRESTDataSource executes the REST API call described in the page config
// and returns the parsed JSON response body.
func callRESTDataSource(cfg map[string]interface{}, body map[string]interface{}) (interface{}, error) {
	urlVal, _ := cfg["url"].(string)
	if urlVal == "" {
		return nil, fmt.Errorf("data source URL is not configured")
	}

	method, _ := cfg["method"].(string)
	if method == "" {
		method = "GET"
	}
	method = strings.ToUpper(method)

	var reqBody io.Reader
	if body != nil && (method == "POST" || method == "PUT" || method == "PATCH") {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, urlVal, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}

	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Auth header — decrypt if stored as encrypted secret
	authHeaderName, _ := cfg["auth_header_name"].(string)
	authHeaderValue, _ := cfg["auth_header_value"].(string)
	if authHeaderName != "" && authHeaderValue != "" {
		if strings.HasPrefix(authHeaderValue, "enc:") {
			decrypted, decErr := crypto.Decrypt(authHeaderValue[4:], config.C.AppSecret)
			if decErr == nil {
				authHeaderValue = decrypted
			}
		}
		req.Header.Set(authHeaderName, authHeaderValue)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upstream returned HTTP %d", resp.StatusCode)
	}

	var result interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response JSON: %w", err)
	}
	return result, nil
}
