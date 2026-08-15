package handlers

import (
	"errors"
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type GroupHandler struct {
	groupsSvc *services.GroupService
	perms     *services.PermissionService
}

func NewGroupHandler(groupsSvc *services.GroupService, perms *services.PermissionService) *GroupHandler {
	return &GroupHandler{groupsSvc: groupsSvc, perms: perms}
}

type groupDTO struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

func groupResponse(g *models.Group) groupDTO {
	return groupDTO{ID: g.ID, Name: g.Name}
}

// authorizeGroupAction implements the plan's repeated "group.<verb> (own)
// or workspace.groups.manage_all" rule — a Group Admin acting on their own
// group, or a workspace Admin acting on any group. Returns false and has
// already written the error response if the caller isn't authorized.
func (h *GroupHandler) authorizeGroupAction(c *gin.Context, groupID uint, groupPermission string) bool {
	user := middleware.CurrentUser(c)

	canViaGroup, err := h.perms.CanGroup(user, groupID, groupPermission)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return false
	}
	if canViaGroup {
		return true
	}

	canViaWorkspace, err := h.perms.CanWorkspace(user, "workspace.groups.manage_all")
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Permission check failed.")
		return false
	}
	if canViaWorkspace {
		return true
	}

	apierror.Send(c, http.StatusForbidden, apierror.CodeForbidden, "You do not have permission to perform this action.")
	return false
}

// List backs GET /groups — any authenticated user (they need to see groups
// to be addable as members / choose ACL subjects), not permission-gated.
func (h *GroupHandler) List(c *gin.Context) {
	groups, err := h.groupsSvc.List()
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load groups.")
		return
	}
	out := make([]groupDTO, 0, len(groups))
	for i := range groups {
		out = append(out, groupResponse(&groups[i]))
	}
	c.JSON(http.StatusOK, out)
}

type createGroupRequest struct {
	Name string `json:"name" binding:"required"`
}

// Create backs POST /groups (workspace.groups.create — any Member or
// Admin). The creator becomes Group Admin automatically.
func (h *GroupHandler) Create(c *gin.Context) {
	var req createGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	actor := middleware.CurrentUser(c)
	g, err := h.groupsSvc.Create(req.Name, actor.ID)
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to create group — the name may already be in use.")
		return
	}
	c.JSON(http.StatusCreated, groupResponse(g))
}

type memberDTO struct {
	UserID   uint   `json:"user_id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	RoleKey  string `json:"role_key"`
}

// Get backs GET /groups/:id — returns the group plus its members.
func (h *GroupHandler) Get(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	g, members, err := h.groupsSvc.Get(id)
	if err != nil {
		apierror.Send(c, http.StatusNotFound, apierror.CodeNotFound, "Group not found.")
		return
	}
	memberOut := make([]memberDTO, 0, len(members))
	for _, m := range members {
		memberOut = append(memberOut, memberDTO{UserID: m.UserID, Name: m.User.DisplayName, Email: m.User.Email, RoleKey: m.Role.Key})
	}
	c.JSON(http.StatusOK, gin.H{"group": groupResponse(g), "members": memberOut})
}

type renameGroupRequest struct {
	Name string `json:"name" binding:"required"`
}

// Rename backs PATCH /groups/:id (group.rename own, or workspace.groups.manage_all).
func (h *GroupHandler) Rename(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	if !h.authorizeGroupAction(c, id, "group.rename") {
		return
	}
	var req renameGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	g, err := h.groupsSvc.Rename(id, req.Name)
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to rename group.")
		return
	}
	c.JSON(http.StatusOK, groupResponse(g))
}

// Delete backs DELETE /groups/:id (group.delete own, or workspace.groups.manage_all).
// 409s if pages still reference this group.
func (h *GroupHandler) Delete(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	if !h.authorizeGroupAction(c, id, "group.delete") {
		return
	}
	if err := h.groupsSvc.Delete(id); err != nil {
		if errors.Is(err, services.ErrGroupHasPages) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "This group still organizes pages — reassign or delete them first.")
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to delete group.")
		return
	}
	c.Status(http.StatusNoContent)
}

type addMemberRequest struct {
	UserID uint `json:"user_id" binding:"required"`
}

// AddMember backs POST /groups/:id/members (group.members.add own, or
// workspace.groups.manage_all).
func (h *GroupHandler) AddMember(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	if !h.authorizeGroupAction(c, id, "group.members.add") {
		return
	}
	var req addMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	if err := h.groupsSvc.AddMember(id, req.UserID); err != nil {
		if errors.Is(err, services.ErrAlreadyMember) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "That user is already a member.")
			return
		}
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to add member.")
		return
	}
	c.Status(http.StatusCreated)
}

// RemoveMember backs DELETE /groups/:id/members/:user_id
// (group.members.remove own, or workspace.groups.manage_all).
func (h *GroupHandler) RemoveMember(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	if !h.authorizeGroupAction(c, id, "group.members.remove") {
		return
	}
	userID, err := parseUintParam(c, "user_id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid user id.")
		return
	}
	if err := h.groupsSvc.RemoveMember(id, userID); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to remove member.")
		return
	}
	c.Status(http.StatusNoContent)
}

type changeMemberRoleRequest struct {
	RoleKey string `json:"role_key" binding:"required"`
}

// ChangeMemberRole backs PATCH /groups/:id/members/:user_id
// (group.members.add own, or workspace.groups.manage_all — per plan, the
// same permission that lets you add a member lets you change their role).
func (h *GroupHandler) ChangeMemberRole(c *gin.Context) {
	id, ok := parseGroupID(c)
	if !ok {
		return
	}
	if !h.authorizeGroupAction(c, id, "group.members.add") {
		return
	}
	userID, err := parseUintParam(c, "user_id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid user id.")
		return
	}
	var req changeMemberRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}
	if err := h.groupsSvc.ChangeMemberRole(id, userID, req.RoleKey); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to change member role.")
		return
	}
	c.Status(http.StatusOK)
}

func parseGroupID(c *gin.Context) (uint, bool) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid group id.")
		return 0, false
	}
	return id, true
}
