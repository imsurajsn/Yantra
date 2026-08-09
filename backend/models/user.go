package models

import "time"

// WorkspaceRole constants
const (
	RoleAdmin  = "Admin"
	RoleMember = "Member"
	RoleViewer = "Viewer"
)

// Workspace permission strings (atomic, checked via user.Can())
const (
	PermWorkspaceUsersCreate     = "workspace.users.create"
	PermWorkspaceUsersDeactivate = "workspace.users.deactivate"
	PermWorkspaceUsersResetPass  = "workspace.users.reset_password"
	PermWorkspaceUsersChangeRole = "workspace.users.change_role"
	PermWorkspaceGroupsCreate    = "workspace.groups.create"
	PermWorkspaceGroupsManageAll = "workspace.groups.manage_all"
	PermWorkspacePagesCreate     = "workspace.pages.create"
	PermWorkspacePagesDeleteAny  = "workspace.pages.delete_any"
	PermWorkspaceAuditView       = "workspace.audit.view"
	PermWorkspaceSettingsManage  = "workspace.settings.manage"
)

// rolePermissions maps built-in workspace roles to their permission bundles.
// All access checks in handlers use user.Can("permission.string"), never role == "Admin".
// This schema supports V2 custom roles without migration.
var rolePermissions = map[string][]string{
	RoleAdmin: {
		PermWorkspaceUsersCreate,
		PermWorkspaceUsersDeactivate,
		PermWorkspaceUsersResetPass,
		PermWorkspaceUsersChangeRole,
		PermWorkspaceGroupsCreate,
		PermWorkspaceGroupsManageAll,
		PermWorkspacePagesCreate,
		PermWorkspacePagesDeleteAny,
		PermWorkspaceAuditView,
		PermWorkspaceSettingsManage,
	},
	RoleMember: {
		PermWorkspaceGroupsCreate,
		PermWorkspacePagesCreate,
	},
	RoleViewer: {},
}

type User struct {
	ID                 uint       `gorm:"primaryKey" json:"id"`
	Email              string     `gorm:"uniqueIndex;not null" json:"email"`
	DisplayName        string     `gorm:"not null" json:"display_name"`
	PasswordHash       string     `gorm:"not null" json:"-"`
	WorkspaceRole      string     `gorm:"not null;default:'Viewer'" json:"workspace_role"`
	MustChangePassword bool       `gorm:"not null;default:true" json:"must_change_password"`
	IsActive           bool       `gorm:"not null;default:true" json:"is_active"`
	TokenVersion       int        `gorm:"not null;default:0" json:"-"` // incremented on logout to invalidate JWTs
	LastLoginAt        *time.Time `json:"last_login_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// Can checks whether this user holds the given workspace permission.
// All RBAC checks in handlers call this method — never compare role strings directly.
func (u *User) Can(permission string) bool {
	perms, ok := rolePermissions[u.WorkspaceRole]
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

// IsAdmin returns true if the user holds the Admin workspace role.
// Use sparingly — prefer u.Can(permission) for specific checks.
func (u *User) IsAdmin() bool {
	return u.WorkspaceRole == RoleAdmin
}

// AccountStatus returns a human-readable account status string.
func (u *User) AccountStatus() string {
	if !u.IsActive {
		return "disabled"
	}
	if u.MustChangePassword {
		return "pending-first-login"
	}
	return "active"
}
