package handlers

import (
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type PageACLHandler struct {
	aclSvc *services.PageACLService
	perms  *services.PermissionService
}

func NewPageACLHandler(aclSvc *services.PageACLService, perms *services.PermissionService) *PageACLHandler {
	return &PageACLHandler{aclSvc: aclSvc, perms: perms}
}

type pageACLEntryDTO struct {
	ID          uint   `json:"id"`
	SubjectType string `json:"subject_type"`
	SubjectID   uint   `json:"subject_id"`
	Role        string `json:"role"`
}

func (h *PageACLHandler) requireManageACL(c *gin.Context, pageID uint) bool {
	user := middleware.CurrentUser(c)
	if user.Role.BypassesPageACL {
		return true
	}
	ok, err := h.perms.CanPage(user, pageID, "page.manage_acl")
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

// List backs GET /pages/:id/acl (page.manage_acl).
func (h *PageACLHandler) List(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	if !h.requireManageACL(c, pageID) {
		return
	}
	entries, err := h.aclSvc.List(pageID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load access list.")
		return
	}
	out := make([]pageACLEntryDTO, 0, len(entries))
	for _, e := range entries {
		out = append(out, pageACLEntryDTO{ID: e.ID, SubjectType: string(e.SubjectType), SubjectID: e.SubjectID, Role: roleKeyToLabel(e.Role.Key)})
	}
	c.JSON(http.StatusOK, out)
}

type addACLRequest struct {
	SubjectType string `json:"subject_type" binding:"required"`
	SubjectID   uint   `json:"subject_id" binding:"required"`
	Role        string `json:"role" binding:"required"`
}

var pageACLRoleKeys = map[string]string{
	"Owner":  models.RolePageOwner,
	"Editor": models.RolePageEditor,
	"Viewer": models.RolePageViewer,
}

// Add backs POST /pages/:id/acl (page.manage_acl).
func (h *PageACLHandler) Add(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	if !h.requireManageACL(c, pageID) {
		return
	}
	var req addACLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	roleKey, validRole := pageACLRoleKeys[req.Role]
	if !validRole || (req.SubjectType != string(models.SubjectUser) && req.SubjectType != string(models.SubjectGroup)) {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid subject_type or role.")
		return
	}
	actor := middleware.CurrentUser(c)
	entry, err := h.aclSvc.Add(pageID, models.ACLSubjectType(req.SubjectType), req.SubjectID, roleKey, actor.ID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to add access entry.")
		return
	}
	c.JSON(http.StatusCreated, pageACLEntryDTO{ID: entry.ID, SubjectType: string(entry.SubjectType), SubjectID: entry.SubjectID, Role: req.Role})
}

// Remove backs DELETE /pages/:id/acl/:acl_id (page.manage_acl).
func (h *PageACLHandler) Remove(c *gin.Context) {
	pageID, ok := parsePageID(c)
	if !ok {
		return
	}
	if !h.requireManageACL(c, pageID) {
		return
	}
	aclID, err := parseUintParam(c, "acl_id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid ACL entry id.")
		return
	}
	if err := h.aclSvc.Remove(aclID); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to remove access entry.")
		return
	}
	c.Status(http.StatusNoContent)
}
