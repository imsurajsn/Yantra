package handlers

import (
	"errors"
	"net/http"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/middleware"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth    *services.AuthService
	usersSvc *services.UserService
	groups  *repositories.GroupRepository
	roles   *repositories.RoleRepository
	cookies *CookieWriter
}

func NewAuthHandler(auth *services.AuthService, usersSvc *services.UserService, groups *repositories.GroupRepository, roles *repositories.RoleRepository, cookies *CookieWriter) *AuthHandler {
	return &AuthHandler{auth: auth, usersSvc: usersSvc, groups: groups, roles: roles, cookies: cookies}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login backs POST /auth/login. Always returns the same generic error for
// unknown email vs. wrong password (PRD requirement 5) — AuthService.Login
// already collapses both to ErrInvalidCredentials.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Enter your email and password.")
		return
	}

	result, err := h.auth.Login(req.Email, req.Password, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		apierror.Send(c, http.StatusUnauthorized, apierror.CodeInvalidCredentials, "Invalid email or password.")
		return
	}

	h.cookies.SetSession(c, result.Token, result.Expiry)
	c.JSON(http.StatusOK, gin.H{"user": userResponse(result.User)})
}

// Logout backs POST /auth/logout — revokes only the caller's own session.
func (h *AuthHandler) Logout(c *gin.Context) {
	user := middleware.CurrentUser(c)
	sessionID := middleware.CurrentSessionID(c)

	if err := h.auth.Logout(user, sessionID, c.ClientIP(), c.Request.UserAgent()); err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to sign out.")
		return
	}
	h.cookies.ClearSession(c)
	c.Status(http.StatusNoContent)
}

type meGroupDTO struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// Me backs GET /auth/me. Returns the flattened permissions array so the
// frontend never re-derives RBAC logic itself (per the plan's frontend
// design) — it just reads this list.
func (h *AuthHandler) Me(c *gin.Context) {
	user := middleware.CurrentUser(c)

	permissions, err := h.roles.PermissionKeys(user.RoleID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load profile.")
		return
	}

	groupIDs, err := h.groups.GroupIDsForUser(user.ID)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load profile.")
		return
	}

	groupsOut := make([]meGroupDTO, 0, len(groupIDs))
	for _, gid := range groupIDs {
		membership, err := h.groups.FindMembership(gid, user.ID)
		if err != nil {
			continue
		}
		group, err := h.groups.FindByID(gid)
		if err != nil {
			continue
		}
		groupsOut = append(groupsOut, meGroupDTO{ID: group.ID, Name: group.Name, Role: membership.Role.Key})
	}

	c.JSON(http.StatusOK, gin.H{
		"user":        userResponse(user),
		"permissions": permissions,
		"groups":      groupsOut,
	})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// ChangePassword backs POST /auth/change-password. Revokes every OTHER
// session, then re-issues a fresh cookie for the caller's own session so
// they aren't logged out by their own password change.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	user := middleware.CurrentUser(c)
	if err := h.usersSvc.ChangeOwnPassword(user.ID, req.CurrentPassword, req.NewPassword); err != nil {
		if errors.Is(err, services.ErrWrongPassword) {
			apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, "Current password is incorrect.")
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to change password.")
		return
	}

	result, err := h.auth.IssueSession(user, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Password changed, but re-signing in failed. Please log in again.")
		return
	}
	h.cookies.SetSession(c, result.Token, result.Expiry)
	c.Status(http.StatusOK)
}

type setFirstLoginPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// SetFirstLoginPassword backs POST /auth/set-first-login-password — the
// mandatory "Set a new password" screen shown right after a first login
// with an admin-issued temporary password (PRD requirement 6). Deliberately
// does not ask for the current password (the mockup's screen has no such
// field): the caller already proved they know it during the login that
// produced this session. See UserService.SetPasswordOnFirstLogin for why
// that's safe — it's gated on must_change_password, so it can't be used to
// silently rotate an already-settled account's password.
func (h *AuthHandler) SetFirstLoginPassword(c *gin.Context) {
	var req setFirstLoginPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	user := middleware.CurrentUser(c)
	if err := h.usersSvc.SetPasswordOnFirstLogin(user.ID, req.NewPassword); err != nil {
		if errors.Is(err, services.ErrNotFirstLogin) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "A password change is not pending for this account.")
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to set password.")
		return
	}

	result, err := h.auth.IssueSession(user, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Password was set, but re-signing in failed. Please log in again.")
		return
	}
	h.cookies.SetSession(c, result.Token, result.Expiry)
	c.Status(http.StatusOK)
}
