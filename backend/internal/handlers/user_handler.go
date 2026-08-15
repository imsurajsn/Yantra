package handlers

import (
	"errors"
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	usersSvc *services.UserService
}

func NewUserHandler(usersSvc *services.UserService) *UserHandler {
	return &UserHandler{usersSvc: usersSvc}
}

// List backs GET /users (workspace.users.view).
func (h *UserHandler) List(c *gin.Context) {
	users, err := h.usersSvc.List()
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load users.")
		return
	}
	out := make([]userDTO, 0, len(users))
	for i := range users {
		out = append(out, userResponse(&users[i]))
	}
	c.JSON(http.StatusOK, out)
}

type createUserRequest struct {
	Email       string `json:"email" binding:"required,email"`
	DisplayName string `json:"display_name" binding:"required"`
	Password    string `json:"password" binding:"required,min=8"`
	RoleKey     string `json:"role_key" binding:"required"`
}

// Create backs POST /users (workspace.users.create). Always creates the
// account with must_change_password=true — the admin-set initial password
// must be replaced on first login (PRD requirement 40).
func (h *UserHandler) Create(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	actor := middleware.CurrentUser(c)
	user, err := h.usersSvc.CreateUser(req.Email, req.DisplayName, req.Password, req.RoleKey, actor.ID)
	if err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "That email is already in use.")
			return
		}
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to create the user — check the role is valid.")
		return
	}
	c.JSON(http.StatusCreated, userResponse(user))
}

type changeRoleRequest struct {
	RoleKey string `json:"role_key" binding:"required"`
}

// ChangeRole backs PATCH /users/:id/role (workspace.users.change_role).
func (h *UserHandler) ChangeRole(c *gin.Context) {
	id, ok := parseUserID(c)
	if !ok {
		return
	}
	var req changeRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	user, err := h.usersSvc.ChangeRole(id, req.RoleKey)
	if err != nil {
		if errors.Is(err, services.ErrLastAdmin) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "Can't change role — this is the last remaining Admin.")
			return
		}
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Failed to change role — check the role is valid.")
		return
	}
	c.JSON(http.StatusOK, userResponse(user))
}

// Deactivate backs POST /users/:id/deactivate (workspace.users.deactivate).
func (h *UserHandler) Deactivate(c *gin.Context) {
	id, ok := parseUserID(c)
	if !ok {
		return
	}
	if err := h.usersSvc.Deactivate(id); err != nil {
		if errors.Is(err, services.ErrLastAdmin) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "Can't deactivate the last remaining Admin.")
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to deactivate user.")
		return
	}
	c.Status(http.StatusNoContent)
}

// Reactivate backs POST /users/:id/reactivate (workspace.users.deactivate —
// the same permission governs both directions of the active/disabled toggle).
func (h *UserHandler) Reactivate(c *gin.Context) {
	id, ok := parseUserID(c)
	if !ok {
		return
	}
	if err := h.usersSvc.Reactivate(id); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to reactivate user.")
		return
	}
	c.Status(http.StatusNoContent)
}

// ResetPassword backs POST /users/:id/reset-password
// (workspace.users.reset_password). The temp password is returned exactly
// once — Admin cannot view existing passwords after this point.
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id, ok := parseUserID(c)
	if !ok {
		return
	}
	temp, err := h.usersSvc.ResetPassword(id)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to reset password.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"temp_password": temp})
}

func parseUserID(c *gin.Context) (uint, bool) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Invalid user id.")
		return 0, false
	}
	return id, true
}
