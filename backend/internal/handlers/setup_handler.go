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

type SetupHandler struct {
	users *repositories.UserRepository
	usersSvc *services.UserService
	auth  *services.AuthService
	guard *middleware.SetupGuard
	cookies *CookieWriter
}

func NewSetupHandler(users *repositories.UserRepository, usersSvc *services.UserService, auth *services.AuthService, guard *middleware.SetupGuard, cookies *CookieWriter) *SetupHandler {
	return &SetupHandler{users: users, usersSvc: usersSvc, auth: auth, guard: guard, cookies: cookies}
}

type setupStatusResponse struct {
	SetupComplete bool `json:"setup_complete"`
}

// GetStatus backs GET /setup/status (always public).
func (h *SetupHandler) GetStatus(c *gin.Context) {
	exists, err := h.users.AnyExists()
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to check setup status.")
		return
	}
	c.JSON(http.StatusOK, setupStatusResponse{SetupComplete: exists})
}

type setupRequest struct {
	Email       string `json:"email" binding:"required,email"`
	DisplayName string `json:"display_name" binding:"required"`
	Password    string `json:"password" binding:"required,min=8"`
}

// Submit backs POST /setup. Per PRD requirement 3, once any Admin exists
// this permanently 409s — checked here explicitly (not just relying on
// SetupGuard, which only blocks OTHER routes while setup is incomplete;
// this route itself must self-disable).
func (h *SetupHandler) Submit(c *gin.Context) {
	var req setupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apierror.Send(c, http.StatusBadRequest, apierror.CodeValidation, err.Error())
		return
	}

	exists, err := h.users.AnyExists()
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to check setup status.")
		return
	}
	if exists {
		apierror.Send(c, http.StatusConflict, apierror.CodeSetupComplete, "Setup has already been completed.")
		return
	}

	user, err := h.usersSvc.CreateFirstAdmin(req.Email, req.DisplayName, req.Password)
	if err != nil {
		if errors.Is(err, services.ErrEmailTaken) {
			apierror.Send(c, http.StatusConflict, apierror.CodeConflict, "That email is already in use.")
			return
		}
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to create the admin account.")
		return
	}

	h.guard.MarkComplete()

	result, err := h.auth.IssueSession(user, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Account was created, but signing in failed. Please log in.")
		return
	}

	h.cookies.SetSession(c, result.Token, result.Expiry)
	c.JSON(http.StatusCreated, gin.H{"user": userResponse(user)})
}
