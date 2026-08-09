package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/crypto"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/middleware"
	"github.com/yantra-platform/yantra/models"
)

// encryptSecretsAndMarshal and maskSecrets use config and crypto directly

// resolvePageRole returns the highest page role the caller holds (via user or group membership).
// Workspace Admins are implicitly treated as Owners on all pages.
func resolvePageRole(callerID uint, callerIsAdmin bool, pageID uint) string {
	if callerIsAdmin {
		return models.PageRoleOwner
	}
	var entries []models.PageACLEntry
	db.DB.Where("page_id = ?", pageID).Find(&entries)

	// Collect group IDs the caller belongs to
	var callerGroupIDs []uint
	var memberships []models.GroupMember
	db.DB.Where("user_id = ?", callerID).Find(&memberships)
	for _, m := range memberships {
		callerGroupIDs = append(callerGroupIDs, m.GroupID)
	}

	best := ""
	for _, e := range entries {
		if (e.SubjectType == "user" && e.SubjectID == callerID) ||
			(e.SubjectType == "group" && containsUint(callerGroupIDs, e.SubjectID)) {
			best = models.HigherPageRole(best, e.PageRole)
		}
	}
	return best
}

func containsUint(slice []uint, val uint) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

// GET /api/pages  — lists pages the caller has at least Viewer access to
func ListPages(c *gin.Context) {
	caller := middleware.CurrentUser(c)

	var allPages []models.Page
	db.DB.Order("title ASC").Find(&allPages)

	type pageItem struct {
		ID        uint   `json:"id"`
		Title     string `json:"title"`
		PageType  string `json:"page_type"`
		PageRole  string `json:"page_role"`
	}

	var visible []pageItem
	for _, p := range allPages {
		role := resolvePageRole(caller.ID, caller.IsAdmin(), p.ID)
		if role != "" {
			visible = append(visible, pageItem{
				ID: p.ID, Title: p.Title, PageType: p.PageType, PageRole: role,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": visible})
}

type pageConfigRequest struct {
	Title    string                 `json:"title" binding:"required"`
	PageType string                 `json:"page_type" binding:"required,oneof=data_table form"`
	Config   map[string]interface{} `json:"config" binding:"required"`
}

// POST /api/pages
func CreatePage(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspacePagesCreate) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req pageConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	configJSON, err := encryptSecretsAndMarshal(req.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process config"})
		return
	}

	page := models.Page{
		Title:    req.Title,
		PageType: req.PageType,
		Config:   configJSON,
	}
	if err := db.DB.Create(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create page"})
		return
	}

	// Creator is always the Owner
	db.DB.Create(&models.PageACLEntry{
		PageID:      page.ID,
		SubjectType: "user",
		SubjectID:   caller.ID,
		PageRole:    models.PageRoleOwner,
	})

	c.JSON(http.StatusCreated, gin.H{"id": page.ID, "title": page.Title, "page_type": page.PageType})
}

// GET /api/pages/:id/config  — returns config with secrets masked
func GetPageConfig(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageEditConfig) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var cfg map[string]interface{}
	json.Unmarshal([]byte(page.Config), &cfg)
	// Mask secret fields before sending to frontend
	maskSecrets(cfg)

	c.JSON(http.StatusOK, gin.H{
		"id":        page.ID,
		"title":     page.Title,
		"page_type": page.PageType,
		"config":    cfg,
	})
}

// PUT /api/pages/:id/config
func UpdatePageConfig(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageEditConfig) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req pageConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Merge: if a secret field is "[REDACTED]", keep the existing encrypted value
	var existing map[string]interface{}
	json.Unmarshal([]byte(page.Config), &existing)
	mergeRedacted(req.Config, existing)

	configJSON, err := encryptSecretsAndMarshal(req.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process config"})
		return
	}

	db.DB.Model(&page).Updates(map[string]interface{}{
		"title":     req.Title,
		"page_type": req.PageType,
		"config":    configJSON,
	})
	c.JSON(http.StatusOK, gin.H{"message": "page updated"})
}

// DELETE /api/pages/:id
func DeletePage(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	canDelete := models.CanOnPage(role, models.PermPageDelete) || caller.Can(models.PermWorkspacePagesDeleteAny)
	if !canDelete {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	db.DB.Where("page_id = ?", page.ID).Delete(&models.PageACLEntry{})
	db.DB.Delete(&page)
	c.JSON(http.StatusOK, gin.H{"message": "page deleted"})
}

// GET /api/pages/:id/acl
func GetPageACL(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageManageACL) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var entries []models.PageACLEntry
	db.DB.Where("page_id = ?", page.ID).Find(&entries)
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

// POST /api/pages/:id/acl
func UpsertPageACL(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageManageACL) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	type aclReq struct {
		SubjectType string `json:"subject_type" binding:"required,oneof=user group"`
		SubjectID   uint   `json:"subject_id" binding:"required"`
		PageRole    string `json:"page_role" binding:"required,oneof=Owner Editor Viewer"`
	}
	var req aclReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var entry models.PageACLEntry
	db.DB.Where("page_id = ? AND subject_type = ? AND subject_id = ?", page.ID, req.SubjectType, req.SubjectID).
		FirstOrCreate(&entry, models.PageACLEntry{
			PageID:      page.ID,
			SubjectType: req.SubjectType,
			SubjectID:   req.SubjectID,
		})
	db.DB.Model(&entry).Update("page_role", req.PageRole)
	c.JSON(http.StatusOK, gin.H{"message": "ACL updated"})
}

// DELETE /api/pages/:page_id/acl/:acl_id
func DeletePageACLEntry(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("page_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageManageACL) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	db.DB.Where("id = ? AND page_id = ?", c.Param("acl_id"), page.ID).Delete(&models.PageACLEntry{})
	c.JSON(http.StatusOK, gin.H{"message": "ACL entry removed"})
}

// GET /api/pages/:id/data  — executes the page's data source query and returns rows
func GetPageData(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageView) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	writeAuditLog(c, caller.Email, models.AuditEventPageView, &page.ID, nil)

	// Decrypt and execute the configured data source
	var cfg map[string]interface{}
	json.Unmarshal([]byte(page.Config), &cfg)
	rows, err := executeDataSource(cfg)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "data source query failed", "detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// POST /api/pages/:id/submit  — executes a Form page action
func SubmitForm(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	var page models.Page
	if err := db.DB.First(&page, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if page.PageType != models.PageTypeForm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "page is not a form"})
		return
	}

	role := resolvePageRole(caller.ID, caller.IsAdmin(), page.ID)
	if !models.CanOnPage(role, models.PermPageView) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var formData map[string]interface{}
	if err := c.ShouldBindJSON(&formData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	writeAuditLog(c, caller.Email, models.AuditEventFormSubmit, &page.ID, formData)

	var cfg map[string]interface{}
	json.Unmarshal([]byte(page.Config), &cfg)
	result, err := executeAction(cfg, formData)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "action failed", "detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": result})
}

// --- helpers ---

// secretKeys lists the config keys whose values are encrypted at rest.
var secretKeys = []string{"auth_header_value", "bearer_token", "api_key", "password", "secret"}

func encryptSecretsAndMarshal(cfg map[string]interface{}) (string, error) {
	for _, key := range secretKeys {
		if val, ok := cfg[key]; ok {
			if strVal, ok := val.(string); ok && strVal != "" && strVal != "[REDACTED]" {
				encrypted, err := crypto.Encrypt(strVal, config.C.AppSecret)
				if err != nil {
					return "", err
				}
				cfg[key] = "enc:" + encrypted
			}
		}
	}
	b, err := json.Marshal(cfg)
	return string(b), err
}

func maskSecrets(cfg map[string]interface{}) {
	for _, key := range secretKeys {
		if _, ok := cfg[key]; ok {
			cfg[key] = "[REDACTED]"
		}
	}
}

// mergeRedacted preserves existing encrypted values when the frontend sends "[REDACTED]".
func mergeRedacted(incoming, existing map[string]interface{}) {
	for _, key := range secretKeys {
		if val, ok := incoming[key]; ok {
			if strVal, ok := val.(string); ok && strVal == "[REDACTED]" {
				if existingVal, ok := existing[key]; ok {
					incoming[key] = existingVal
				}
			}
		}
	}
}

// executeDataSource runs the configured REST data source and returns rows.
// V1 supports REST API only; DB connectors are a V2 feature.
func executeDataSource(cfg map[string]interface{}) (interface{}, error) {
	return callRESTDataSource(cfg, nil)
}

func executeAction(cfg map[string]interface{}, body map[string]interface{}) (interface{}, error) {
	return callRESTDataSource(cfg, body)
}
