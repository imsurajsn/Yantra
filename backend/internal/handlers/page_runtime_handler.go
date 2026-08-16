package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type PageRuntimeHandler struct {
	pagesSvc *services.PageService
	perms    *services.PermissionService
	audit    *services.AuditService
}

func NewPageRuntimeHandler(pagesSvc *services.PageService, perms *services.PermissionService, audit *services.AuditService) *PageRuntimeHandler {
	return &PageRuntimeHandler{pagesSvc: pagesSvc, perms: perms, audit: audit}
}

func (h *PageRuntimeHandler) requireRole(c *gin.Context, pageID uint, permission string) (*models.Page, bool) {
	user := middleware.CurrentUser(c)
	ok, err := h.perms.CanPage(user, pageID, permission)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return nil, false
	}
	if !ok {
		apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "Not authorized.")
		return nil, false
	}
	page, err := h.pagesSvc.Get(pageID)
	if err != nil {
		apierror.Send(c, http.StatusNotFound, apierror.CodeNotFound, "Page not found.")
		return nil, false
	}
	return page, true
}

// View backs POST /pages/:id/view (page.view) — records exactly one
// page_view audit row per page open. Kept separate from the data fetch so
// client-side sort/pagination (which re-triggers GET /pages/:id/data but is
// not a new "view") never doubles up on page_view rows.
func (h *PageRuntimeHandler) View(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	page, ok := h.requireRole(c, pageID, "page.view")
	if !ok {
		return
	}
	user := middleware.CurrentUser(c)
	if err := h.audit.RecordPageView(user.Email, user.ID, pageID, page.Name); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to record page view.")
		return
	}
	c.Status(http.StatusNoContent)
}

// Data backs GET /pages/:id/data (page.view) — proxies to the page's
// configured GET endpoint with decrypted auth headers, and audits the call.
func (h *PageRuntimeHandler) Data(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	page, ok := h.requireRole(c, pageID, "page.view")
	if !ok {
		return
	}
	if page.PageType != models.PageTypeTable {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "This page is not a Data Table page.")
		return
	}

	var cfg models.TableConfig
	if err := json.Unmarshal(page.Config, &cfg); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to read page config.")
		return
	}
	headers, err := h.pagesSvc.DecryptedAuthHeaders(pageID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load page credentials.")
		return
	}

	body, status, err := services.ProxyRequest(cfg.Source.Method, cfg.Source.Endpoint, headers, nil)
	user := middleware.CurrentUser(c)
	_ = h.audit.RecordAPICall(user.Email, user.ID, pageID, page.Name, cfg.Source.Method, cfg.Source.Endpoint, status)
	if err != nil {
		apierror.Send(c, http.StatusBadGateway, "upstream_error", "Could not reach the configured endpoint: "+err.Error())
		return
	}
	// The Table viewer assumes this endpoint always returns a bare JSON
	// array — extraction happens here, not client-side, so a misconfigured
	// items_path surfaces as a clear error instead of a blank/broken table.
	items, extractErr := services.ExtractItems(body, cfg.ItemsPath)
	if extractErr != nil {
		apierror.Send(c, http.StatusBadGateway, "upstream_shape_error", "Unexpected response shape from the configured endpoint: "+extractErr.Error())
		return
	}
	c.Data(http.StatusOK, "application/json", items)
}

type writebackRequest struct {
	Fields map[string]interface{} `json:"fields"`
}

// Writeback backs PATCH /pages/:id/data/:row_id (Editor/Owner —
// page.edit_config). 400s if the page's config doesn't have writeback
// enabled.
func (h *PageRuntimeHandler) Writeback(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	page, ok := h.requireRole(c, pageID, "page.edit_config")
	if !ok {
		return
	}
	if page.PageType != models.PageTypeTable {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "This page is not a Data Table page.")
		return
	}

	var cfg models.TableConfig
	if err := json.Unmarshal(page.Config, &cfg); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to read page config.")
		return
	}
	if !cfg.Writeback.Enabled {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "This page does not have writeback enabled.")
		return
	}

	var req writebackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	rowID := c.Param("row_id")
	endpoint := strings.ReplaceAll(cfg.Writeback.Endpoint, "{"+cfg.Writeback.IDField+"}", rowID)
	headers, err := h.pagesSvc.DecryptedAuthHeaders(pageID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load page credentials.")
		return
	}

	body, status, err := services.ProxyRequest(cfg.Writeback.Method, endpoint, headers, req.Fields)
	user := middleware.CurrentUser(c)
	_ = h.audit.RecordAPICall(user.Email, user.ID, pageID, page.Name, cfg.Writeback.Method, endpoint, status)
	if err != nil {
		apierror.Send(c, http.StatusBadGateway, "upstream_error", "Could not reach the configured endpoint: "+err.Error())
		return
	}
	c.Data(status, "application/json", body)
}

type submitRequest struct {
	FieldValues map[string]interface{} `json:"field_values"`
}

// Submit backs POST /pages/:id/submit (Editor/Owner — page.edit_config).
// Sensitive fields are redacted before the audit row is ever constructed
// (PRD requirement 28) — the redaction happens here, not in AuditService,
// because only this handler knows which config's field definitions apply.
func (h *PageRuntimeHandler) Submit(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	page, ok := h.requireRole(c, pageID, "page.edit_config")
	if !ok {
		return
	}
	if page.PageType != models.PageTypeForm {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "This page is not a Form page.")
		return
	}

	var cfg models.FormConfig
	if err := json.Unmarshal(page.Config, &cfg); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to read page config.")
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	sensitiveKeys, err := h.pagesSvc.SensitiveFieldKeys(page.Config)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to read page config.")
		return
	}
	redacted := services.RedactSensitiveFields(req.FieldValues, sensitiveKeys)

	headers, err := h.pagesSvc.DecryptedAuthHeaders(pageID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load page credentials.")
		return
	}

	body, status, err := services.ProxyRequest(cfg.Source.Method, cfg.Source.Endpoint, headers, req.FieldValues)
	user := middleware.CurrentUser(c)
	_ = h.audit.RecordFormSubmit(user.Email, user.ID, pageID, page.Name, redacted)
	if err != nil {
		apierror.Send(c, http.StatusBadGateway, "upstream_error", "Could not reach the configured endpoint: "+err.Error())
		return
	}

	success := status >= 200 && status < 300
	message := "Submission failed."
	if success {
		if cfg.SuccessMessage != "" {
			message = cfg.SuccessMessage
		} else {
			message = "Submitted successfully."
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": success, "status_code": status, "message": message, "response": json.RawMessage(body)})
}
