package handlers

import (
	"net/http"
	"strconv"

	"github.com/imsurajsn/yantra/internal/apierror"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/gin-gonic/gin"
)

type AuditHandler struct {
	audit *repositories.AuditRepository
}

func NewAuditHandler(audit *repositories.AuditRepository) *AuditHandler {
	return &AuditHandler{audit: audit}
}

type auditEntryDTO struct {
	ID         uint64 `json:"id"`
	Timestamp  string `json:"timestamp"`
	UserEmail  string `json:"user_email"`
	EventType  string `json:"event_type"`
	Target     string `json:"target"`
	StatusCode *int   `json:"status_code,omitempty"`
}

// List backs GET /audit-log (workspace.audit.view). Query params:
// user_id, event_type, from, to, page, page_size.
func (h *AuditHandler) List(c *gin.Context) {
	var filter repositories.AuditFilter

	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			uid := uint(id)
			filter.ActorUserID = &uid
		}
	}
	if v := c.Query("event_type"); v != "" {
		et := models.AuditEventType(v)
		filter.EventType = &et
	}
	if v := c.Query("from"); v != "" {
		filter.From = &v
	}
	if v := c.Query("to"); v != "" {
		filter.To = &v
	}
	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			filter.Page = p
		}
	}
	if v := c.Query("page_size"); v != "" {
		if ps, err := strconv.Atoi(v); err == nil {
			filter.PageSize = ps
		}
	}

	result, err := h.audit.Query(filter)
	if err != nil {
		apierror.Send(c, http.StatusInternalServerError, apierror.CodeInternal, "Failed to load audit log.")
		return
	}

	items := make([]auditEntryDTO, 0, len(result.Items))
	for _, e := range result.Items {
		target := "—"
		if e.PageTitleSnapshot != nil {
			target = *e.PageTitleSnapshot
		}
		items = append(items, auditEntryDTO{
			ID: e.ID, Timestamp: e.CreatedAt.Format("2006-01-02 15:04:05"), UserEmail: e.ActorEmail,
			EventType: string(e.EventType), Target: target, StatusCode: e.HTTPStatusCode,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": result.Total, "page": result.Page, "page_size": result.PageSize})
}
