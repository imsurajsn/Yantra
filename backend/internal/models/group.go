package models

import "time"

// Group is a single unified concept: it is both the sidebar nav-organization
// bucket for pages (Page.PageGroupID) AND the RBAC subject groups are
// assigned to in PageACL. A page's ACL entries are independent of its own
// nav group — granting access via a different group is normal.
type Group struct {
	ID          uint   `gorm:"primaryKey"`
	Name        string `gorm:"uniqueIndex;not null;size:150"`
	CreatedByID uint   `gorm:"not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// GroupMember links a user to a group with a group-scoped role
// (group_admin or group_member). The creator of a group is auto-inserted
// here as group_admin. Both FKs cascade — deleting a group or user removes
// its memberships (users are never hard-deleted in V1, so the user-side
// cascade is defensive rather than load-bearing today).
type GroupMember struct {
	ID      uint  `gorm:"primaryKey"`
	GroupID uint  `gorm:"not null;uniqueIndex:idx_group_user"`
	Group   Group `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE"`
	UserID  uint  `gorm:"not null;uniqueIndex:idx_group_user"`
	User    User  `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	RoleID  uint  `gorm:"not null"` // FK roles(id), group-scoped role
	Role    Role  `gorm:"foreignKey:RoleID"`
}
