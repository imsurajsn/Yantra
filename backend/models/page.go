package models

import "time"

// Page type constants
const (
	PageTypeDataTable = "data_table"
	PageTypeForm      = "form"
)

// Page ACL role constants
const (
	PageRoleOwner  = "Owner"
	PageRoleEditor = "Editor"
	PageRoleViewer = "Viewer"
)

// Page permission strings (scoped per page, resolved from ACL)
const (
	PermPageView      = "page.view"
	PermPageEditConfig = "page.edit_config"
	PermPageDelete    = "page.delete"
	PermPageManageACL = "page.manage_acl"
)

var pageRolePermissions = map[string][]string{
	PageRoleOwner: {
		PermPageView,
		PermPageEditConfig,
		PermPageDelete,
		PermPageManageACL,
	},
	PageRoleEditor: {
		PermPageView,
		PermPageEditConfig,
	},
	PageRoleViewer: {
		PermPageView,
	},
}

// Page stores the metadata and config for a workspace page.
// Config is a JSON blob; auth headers within it are AES-256-GCM encrypted at rest.
type Page struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Title     string    `gorm:"not null" json:"title"`
	PageType  string    `gorm:"not null" json:"page_type"` // data_table | form
	Config    string    `gorm:"type:text;not null" json:"-"` // JSON, secrets encrypted — never sent raw to frontend
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PageACLEntry represents a single access control entry on a page.
// SubjectType is "user" or "group"; SubjectID references User.ID or Group.ID.
type PageACLEntry struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	PageID      uint      `gorm:"index;not null" json:"page_id"`
	SubjectType string    `gorm:"not null" json:"subject_type"` // user | group
	SubjectID   uint      `gorm:"not null" json:"subject_id"`
	PageRole    string    `gorm:"not null" json:"page_role"` // Owner | Editor | Viewer
	CreatedAt   time.Time `json:"created_at"`
}

// PageRoleOrder maps page roles to a numeric priority for "highest role wins" resolution.
var PageRoleOrder = map[string]int{
	PageRoleOwner:  3,
	PageRoleEditor: 2,
	PageRoleViewer: 1,
}

// CanOnPage checks whether the given page role holds the page permission.
func CanOnPage(pageRole, permission string) bool {
	perms, ok := pageRolePermissions[pageRole]
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

// HigherPageRole returns the higher-priority of two page roles.
func HigherPageRole(a, b string) string {
	if PageRoleOrder[a] >= PageRoleOrder[b] {
		return a
	}
	return b
}
