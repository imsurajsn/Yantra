package models

import "time"

// Group role constants (scoped per group, independent of workspace role)
const (
	GroupRoleAdmin  = "Group Admin"
	GroupRoleMember = "Group Member"
)

// Group permission strings (scoped — checked by group-level RBAC helpers)
const (
	PermGroupMembersAdd    = "group.members.add"
	PermGroupMembersRemove = "group.members.remove"
	PermGroupRename        = "group.rename"
	PermGroupDelete        = "group.delete"
)

var groupRolePermissions = map[string][]string{
	GroupRoleAdmin: {
		PermGroupMembersAdd,
		PermGroupMembersRemove,
		PermGroupRename,
		PermGroupDelete,
	},
	GroupRoleMember: {},
}

type Group struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type GroupMember struct {
	GroupID   uint      `gorm:"primaryKey" json:"group_id"`
	UserID    uint      `gorm:"primaryKey" json:"user_id"`
	GroupRole string    `gorm:"not null;default:'Group Member'" json:"group_role"`
	CreatedAt time.Time `json:"created_at"`
}

// CanInGroup checks whether the given group role holds the permission.
func CanInGroup(groupRole, permission string) bool {
	perms, ok := groupRolePermissions[groupRole]
	if !ok {
		return false
	}
	for _, p := range perms {
		if p == permission {
			return true
		}
	}
	return false
}
