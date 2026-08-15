package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type PageHandler struct {
	pagesSvc    *services.PageService
	pageACLsSvc *services.PageACLService
	perms       *services.PermissionService
}

func NewPageHandler(pagesSvc *services.PageService, pageACLsSvc *services.PageACLService, perms *services.PermissionService) *PageHandler {
	return &PageHandler{pagesSvc: pagesSvc, pageACLsSvc: pageACLsSvc, perms: perms}
}

type authHeaderDTO struct {
	Name  string `json:"name" binding:"required"`
	Value string `json:"value" binding:"required"`
}

func toAuthHeaderInputs(dtos []authHeaderDTO) []services.AuthHeaderInput {
	out := make([]services.AuthHeaderInput, 0, len(dtos))
	for _, h := range dtos {
		out = append(out, services.AuthHeaderInput{Name: h.Name, Value: h.Value})
	}
	return out
}

type pageListItemDTO struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Type          string `json:"type"`
	PageGroupID   uint   `json:"page_group_id"`
	EffectiveRole string `json:"effective_role"`
}

// List backs GET /pages — filtered to pages the caller can view (Admin sees
// all). Includes each page's effective_role — the mockup's Home cards show
// a role badge per page, and the resolution is already computed here for
// the ACL filter itself, so returning it costs nothing extra.
func (h *PageHandler) List(c *gin.Context) {
	user := middleware.CurrentUser(c)
	pages, err := h.pagesSvc.List()
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load pages.")
		return
	}

	out := make([]pageListItemDTO, 0, len(pages))
	for _, p := range pages {
		if user.Role.BypassesPageACL {
			out = append(out, pageListItemDTO{ID: p.ID, Name: p.Name, Description: p.Description, Type: string(p.PageType), PageGroupID: p.PageGroupID, EffectiveRole: "Owner"})
			continue
		}
		role, ok, err := h.perms.EffectivePageRole(user, p.ID)
		if err != nil {
			apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to resolve page access.")
			return
		}
		if ok {
			out = append(out, pageListItemDTO{ID: p.ID, Name: p.Name, Description: p.Description, Type: string(p.PageType), PageGroupID: p.PageGroupID, EffectiveRole: roleKeyToLabel(role.Key)})
		}
	}
	c.JSON(http.StatusOK, out)
}

type validateRequest struct {
	PageType string `json:"page_type" binding:"required"`
	YAML     string `json:"yaml" binding:"required"`
}

type validateResponse struct {
	Valid   bool     `json:"valid"`
	Errors  []string `json:"errors"`
	Title   string   `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

// Validate backs POST /pages/validate — stateless, no DB write.
func (h *PageHandler) Validate(c *gin.Context) {
	var req validateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	parsed, errs := services.ValidatePageYAML(models.PageType(req.PageType), req.YAML)
	if errs != nil {
		c.JSON(http.StatusOK, validateResponse{Valid: false, Errors: errs})
		return
	}
	c.JSON(http.StatusOK, validateResponse{Valid: true, Errors: []string{}, Title: parsed.Title, Description: parsed.Description})
}

type previewRequest struct {
	PageType    string          `json:"page_type" binding:"required"`
	YAML        string          `json:"yaml" binding:"required"`
	AuthHeaders []authHeaderDTO `json:"auth_headers"`
}

// Preview backs POST /pages/preview. Table previews call the live GET
// endpoint (safe, non-destructive); form previews are rendered client-side
// from the field definitions only and never actually POST to the real
// target — see PagePreviewRuntime's doc comment for why.
func (h *PageHandler) Preview(c *gin.Context) {
	var req previewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	parsed, errs := services.ValidatePageYAML(models.PageType(req.PageType), req.YAML)
	if errs != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Config is invalid — validate it first.")
		return
	}

	if models.PageType(req.PageType) == models.PageTypeForm {
		c.JSON(http.StatusOK, gin.H{"fields": parsed.FormConfig.Fields})
		return
	}

	headers := make(map[string]string, len(req.AuthHeaders))
	for _, h2 := range req.AuthHeaders {
		headers[h2.Name] = h2.Value
	}
	sample, status, err := services.ProxyRequest(parsed.TableConfig.Source.Method, parsed.TableConfig.Source.Endpoint, headers, nil)
	if err != nil {
		apierror.Send(c, http.StatusBadGateway, "upstream_error", "Could not reach the configured endpoint: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"columns": parsed.TableConfig.Columns, "sample_status": status, "sample_data": sample})
}

type createPageRequest struct {
	PageGroupID uint            `json:"page_group_id" binding:"required"`
	PageType    string          `json:"page_type" binding:"required"`
	YAML        string          `json:"yaml" binding:"required"`
	AuthHeaders []authHeaderDTO `json:"auth_headers"`
}

// Create backs POST /pages (workspace.pages.create). The creator gets an
// auto page-Owner ACL row, so they can immediately manage the page they
// just made — nobody else can see it until an ACL entry is added.
func (h *PageHandler) Create(c *gin.Context) {
	var req createPageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	actor := middleware.CurrentUser(c)
	page, errs, err := h.pagesSvc.Create(models.PageType(req.PageType), req.YAML, req.PageGroupID, actor.ID, toAuthHeaderInputs(req.AuthHeaders))
	if err != nil {
		if errors.Is(err, services.ErrPageValidation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": apierror.CodeValidation, "message": "Config is invalid."}, "errors": errs})
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to create page.")
		return
	}

	if err := h.pageACLsSvc.GrantOwner(page.ID, actor.ID); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Page created, but failed to grant you access to it.")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": page.ID, "name": page.Name, "type": page.PageType})
}

// Get backs GET /pages/:id — requires page.view (or Admin bypass); returns
// the full config + masked header names + the caller's effective_role and
// derived can_edit/can_delete/can_manage_acl flags, so the frontend never
// re-derives ACL resolution itself.
func (h *PageHandler) Get(c *gin.Context) {
	id, ok := parsePageID(c)
	if !ok {
		return
	}
	user := middleware.CurrentUser(c)

	can, err := h.perms.CanPage(user, id, "page.view")
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return
	}
	if !can {
		apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "Not authorized.")
		return
	}

	page, err := h.pagesSvc.Get(id)
	if err != nil {
		apierror.Send(c, http.StatusNotFound, apierror.CodeNotFound, "Page not found.")
		return
	}
	headerNames, err := h.pagesSvc.MaskedAuthHeaderNames(id)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load page.")
		return
	}
	yamlText, err := services.ToYAML(page)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to render page config.")
		return
	}

	roleLabel, canEdit, canDelete, canManageACL := "Viewer", false, false, false
	if user.Role.BypassesPageACL {
		roleLabel, canEdit, canDelete, canManageACL = "Owner", true, true, true
	} else if role, ok, _ := h.perms.EffectivePageRole(user, id); ok {
		roleLabel = roleKeyToLabel(role.Key)
		canEdit = role.Key == models.RolePageOwner || role.Key == models.RolePageEditor
		canDelete = role.Key == models.RolePageOwner
		canManageACL = role.Key == models.RolePageOwner
	}

	c.JSON(http.StatusOK, gin.H{
		"id": page.ID, "name": page.Name, "description": page.Description,
		"type": page.PageType, "page_group_id": page.PageGroupID,
		// yaml is for the admin config editor; config is the same data
		// already-validated and structured (columns/fields/writeback), for
		// the Table/Form viewer screens to render directly — they must not
		// need a YAML parser client-side just to read what the editor wrote.
		"yaml": yamlText, "config": json.RawMessage(page.Config), "auth_header_names": headerNames,
		"effective_role": roleLabel, "can_edit": canEdit, "can_delete": canDelete, "can_manage_acl": canManageACL,
	})
}

func roleKeyToLabel(key string) string {
	switch key {
	case models.RolePageOwner:
		return "Owner"
	case models.RolePageEditor:
		return "Editor"
	default:
		return "Viewer"
	}
}

type updatePageRequest struct {
	PageGroupID uint            `json:"page_group_id" binding:"required"`
	YAML        string          `json:"yaml" binding:"required"`
	AuthHeaders []authHeaderDTO `json:"auth_headers"`
}

// Update backs PATCH /pages/:id (page.edit_config).
func (h *PageHandler) Update(c *gin.Context) {
	id, ok := parsePageID(c)
	if !ok {
		return
	}
	if !h.requirePagePermission(c, id, "page.edit_config") {
		return
	}
	var req updatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	page, errs, err := h.pagesSvc.Update(id, req.PageGroupID, req.YAML, toAuthHeaderInputs(req.AuthHeaders))
	if err != nil {
		if errors.Is(err, services.ErrPageValidation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": apierror.CodeValidation, "message": "Config is invalid."}, "errors": errs})
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to update page.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": page.ID, "name": page.Name})
}

// Delete backs DELETE /pages/:id (page.delete, or workspace.pages.delete_any).
// ACL entries and auth headers cascade at the DB level (ON DELETE CASCADE) —
// no manual cleanup needed here.
func (h *PageHandler) Delete(c *gin.Context) {
	id, ok := parsePageID(c)
	if !ok {
		return
	}
	user := middleware.CurrentUser(c)
	canDeleteAny, err := h.perms.CanWorkspace(user, "workspace.pages.delete_any")
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return
	}
	if !canDeleteAny {
		if !h.requirePagePermission(c, id, "page.delete") {
			return
		}
	}
	if err := h.pagesSvc.Delete(id); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to delete page.")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *PageHandler) requirePagePermission(c *gin.Context, pageID uint, permission string) bool {
	user := middleware.CurrentUser(c)
	ok, err := h.perms.CanPage(user, pageID, permission)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return false
	}
	if !ok {
		apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "Not authorized.")
		return false
	}
	return true
}

func parsePageID(c *gin.Context) (uint, bool) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid page id.")
		return 0, false
	}
	return id, true
}
