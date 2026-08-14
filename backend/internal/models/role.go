package models

// Role is a named bundle of permissions, scoped to workspace/group/page.
// V1 ships a fixed, system-seeded set (IsSystem=true); V2 adds custom
// workspace roles on top of the same table with zero schema migration.
// Role.Permissions is deliberately NOT a GORM many2many association — the
// join is the explicit RolePermission model (its own id, its own migration),
// queried directly by permission_service. Two competing owners of the same
// join table (an auto-managed many2many + an explicit model) would fight
// each other during AutoMigrate.
type Role struct {
	ID              uint            `gorm:"primaryKey"`
	Key             string          `gorm:"uniqueIndex;not null;size:50"`
	Name            string          `gorm:"not null;size:100"`
	Scope           PermissionScope `gorm:"not null;size:20"`
	IsSystem        bool            `gorm:"not null;default:true"`
	BypassesPageACL bool            `gorm:"not null;default:false"`
	Rank            int             `gorm:"not null;default:0"` // page-scope only: used to resolve "highest role wins"
}

// Well-known system role keys.
const (
	RoleAdmin       = "admin"
	RoleMember      = "member"
	RoleViewer      = "viewer"
	RoleGroupAdmin  = "group_admin"
	RoleGroupMember = "group_member"
	RolePageOwner   = "page_owner"
	RolePageEditor  = "page_editor"
	RolePageViewer  = "page_viewer"
)

// Page-scope role ranks — higher wins when a user has multiple ACL entries.
const (
	RankPageViewer = 10
	RankPageEditor = 20
	RankPageOwner  = 30
)
