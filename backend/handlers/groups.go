package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yantra-platform/yantra/db"
	"github.com/yantra-platform/yantra/middleware"
	"github.com/yantra-platform/yantra/models"
)

// GET /api/groups
func ListGroups(c *gin.Context) {
	var groups []models.Group
	db.DB.Order("name ASC").Find(&groups)
	c.JSON(http.StatusOK, gin.H{"data": groups})
}

// POST /api/groups
func CreateGroup(c *gin.Context) {
	caller := middleware.CurrentUser(c)
	if !caller.Can(models.PermWorkspaceGroupsCreate) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	type req struct {
		Name string `json:"name" binding:"required"`
	}
	var body req
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(body.Name)
	var existing models.Group
	if db.DB.Where("name = ?", name).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "a group with this name already exists"})
		return
	}

	group := models.Group{Name: name}
	if err := db.DB.Create(&group).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create group"})
		return
	}

	// Creator becomes the first Group Admin
	member := models.GroupMember{
		GroupID:   group.ID,
		UserID:    caller.ID,
		GroupRole: models.GroupRoleAdmin,
	}
	db.DB.Create(&member)

	c.JSON(http.StatusCreated, group)
}

// GET /api/groups/:id/members
func ListGroupMembers(c *gin.Context) {
	var group models.Group
	if err := db.DB.First(&group, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}

	type memberRow struct {
		UserID      uint   `json:"user_id"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		GroupRole   string `json:"group_role"`
	}
	var members []memberRow
	db.DB.Table("group_members").
		Select("group_members.user_id, users.email, users.display_name, group_members.group_role").
		Joins("JOIN users ON users.id = group_members.user_id").
		Where("group_members.group_id = ?", group.ID).
		Scan(&members)

	c.JSON(http.StatusOK, gin.H{"data": members})
}

// POST /api/groups/:id/members
func AddGroupMember(c *gin.Context) {
	caller := middleware.CurrentUser(c)

	var group models.Group
	if err := db.DB.First(&group, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}

	// Must be workspace Admin OR a Group Admin of this group
	if !caller.Can(models.PermWorkspaceGroupsManageAll) && !isGroupAdmin(caller.ID, group.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	type req struct {
		UserID    uint   `json:"user_id" binding:"required"`
		GroupRole string `json:"group_role" binding:"required,oneof='Group Admin' 'Group Member'"`
	}
	var body req
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := db.DB.First(&user, body.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var existing models.GroupMember
	if db.DB.Where("group_id = ? AND user_id = ?", group.ID, body.UserID).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user is already a member of this group"})
		return
	}

	m := models.GroupMember{GroupID: group.ID, UserID: body.UserID, GroupRole: body.GroupRole}
	db.DB.Create(&m)
	c.JSON(http.StatusCreated, gin.H{"message": "member added"})
}

// DELETE /api/groups/:id/members/:user_id
func RemoveGroupMember(c *gin.Context) {
	caller := middleware.CurrentUser(c)

	var group models.Group
	if err := db.DB.First(&group, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}

	if !caller.Can(models.PermWorkspaceGroupsManageAll) && !isGroupAdmin(caller.ID, group.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	db.DB.Where("group_id = ? AND user_id = ?", group.ID, c.Param("user_id")).Delete(&models.GroupMember{})
	c.JSON(http.StatusOK, gin.H{"message": "member removed"})
}

// DELETE /api/groups/:id
func DeleteGroup(c *gin.Context) {
	caller := middleware.CurrentUser(c)

	var group models.Group
	if err := db.DB.First(&group, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}

	if !caller.Can(models.PermWorkspaceGroupsManageAll) && !isGroupAdmin(caller.ID, group.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	db.DB.Where("group_id = ?", group.ID).Delete(&models.GroupMember{})
	db.DB.Delete(&group)
	c.JSON(http.StatusOK, gin.H{"message": "group deleted"})
}

func isGroupAdmin(userID, groupID uint) bool {
	var m models.GroupMember
	err := db.DB.Where("group_id = ? AND user_id = ? AND group_role = ?", groupID, userID, models.GroupRoleAdmin).First(&m).Error
	return err == nil
}
