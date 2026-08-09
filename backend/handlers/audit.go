package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/middleware"
	"github.com/yantra-platform/yantra/models"
)

// writeAuditLog is the single write path for audit entries.
// It is append-only — no update/delete path exists anywhere in the codebase.
func writeAuditLog(c *gin.Context, userEmail, eventType string, pageID *uint, fieldValues map[string]interface{}) {
	status := c.Writer.Status()
	entry := models.AuditLog{
		UserEmail:  userEmail,
		EventType:  eventType,
		PageID:     pageID,
		IPAddress:  c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		Endpoint:   c.Request.URL.Path,
		HTTPMethod: c.Request.Method,
		HTTPStatus: &status,
		Timestamp:  time.Now(),
	}
	if fieldValues != nil {
		b, _ := json.Marshal(fieldValues)
		entry.FieldValues = string(b)
	}
	// Fire-and-forget; audit write failures should not break the main request.
	go db.DB.Create(&entry)
}

// GET /api/admin/audit
// Query params: page, page_size, user_email, event_type, from, to
func ListAuditLogs(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceAuditView) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	query := db.DB.Model(&models.AuditLog{}).Order("timestamp DESC")

	if email := c.Query("user_email"); email != "" {
		query = query.Where("user_email = ?", email)
	}
	if eventType := c.Query("event_type"); eventType != "" {
		query = query.Where("event_type = ?", eventType)
	}
	if from := c.Query("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			query = query.Where("timestamp >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			query = query.Where("timestamp <= ?", t)
		}
	}

	var total int64
	query.Count(&total)

	var logs []models.AuditLog
	query.Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"data":       logs,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}
