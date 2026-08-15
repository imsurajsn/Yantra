package db

import (
	"fmt"

	m "github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

// permissionSeed is the full, system-owned permission catalogue. V1 never
// lets a user define new permission keys — only new Roles built from these
// (that's what makes V2 custom roles a zero-migration feature).
var permissionSeed = []m.Permission{
	// Workspace. workspace.users.view is one addition beyond the PRD's
	// explicit list — required to list users for the User Management
	// screen at all.
	{Key: "workspace.users.view", Scope: m.ScopeWorkspace, Description: "View the list of workspace users"},
	{Key: "workspace.users.create", Scope: m.ScopeWorkspace, Description: "Create new user accounts"},
	{Key: "workspace.users.deactivate", Scope: m.ScopeWorkspace, Description: "Deactivate / reactivate users"},
	{Key: "workspace.users.reset_password", Scope: m.ScopeWorkspace, Description: "Reset any user's password"},
	{Key: "workspace.users.change_role", Scope: m.ScopeWorkspace, Description: "Change a user's workspace role"},
	{Key: "workspace.groups.create", Scope: m.ScopeWorkspace, Description: "Create new groups"},
	{Key: "workspace.groups.manage_all", Scope: m.ScopeWorkspace, Description: "Manage any group"},
	{Key: "workspace.pages.create", Scope: m.ScopeWorkspace, Description: "Create new pages"},
	{Key: "workspace.pages.delete_any", Scope: m.ScopeWorkspace, Description: "Delete any page in the workspace"},
	{Key: "workspace.audit.view", Scope: m.ScopeWorkspace, Description: "View the audit log"},
	{Key: "workspace.settings.manage", Scope: m.ScopeWorkspace, Description: "Manage workspace-level settings"},
	// Group
	{Key: "group.members.add", Scope: m.ScopeGroup, Description: "Add members to the group"},
	{Key: "group.members.remove", Scope: m.ScopeGroup, Description: "Remove members from the group"},
	{Key: "group.rename", Scope: m.ScopeGroup, Description: "Rename the group"},
	{Key: "group.delete", Scope: m.ScopeGroup, Description: "Delete the group"},
	// Page
	{Key: "page.view", Scope: m.ScopePage, Description: "View and interact with the page"},
	{Key: "page.edit_config", Scope: m.ScopePage, Description: "Edit the page configuration"},
	{Key: "page.delete", Scope: m.ScopePage, Description: "Delete the page"},
	{Key: "page.manage_acl", Scope: m.ScopePage, Description: "Add / remove ACL entries on the page"},
}

var roleSeed = []m.Role{
	{Key: m.RoleAdmin, Name: "Admin", Scope: m.ScopeWorkspace, IsSystem: true, BypassesPageACL: true},
	{Key: m.RoleMember, Name: "Member", Scope: m.ScopeWorkspace, IsSystem: true},
	{Key: m.RoleViewer, Name: "Viewer", Scope: m.ScopeWorkspace, IsSystem: true},
	{Key: m.RoleGroupAdmin, Name: "Group Admin", Scope: m.ScopeGroup, IsSystem: true},
	{Key: m.RoleGroupMember, Name: "Group Member", Scope: m.ScopeGroup, IsSystem: true},
	{Key: m.RolePageOwner, Name: "Owner", Scope: m.ScopePage, IsSystem: true, Rank: m.RankPageOwner},
	{Key: m.RolePageEditor, Name: "Editor", Scope: m.ScopePage, IsSystem: true, Rank: m.RankPageEditor},
	{Key: m.RolePageViewer, Name: "Viewer", Scope: m.ScopePage, IsSystem: true, Rank: m.RankPageViewer},
}

// rolePermissionSeed maps each system role to its permission bundle, per
// PRD Section 3's built-in role tables.
var rolePermissionSeed = map[string][]string{
	m.RoleAdmin: {
		"workspace.users.view", "workspace.users.create", "workspace.users.deactivate",
		"workspace.users.reset_password", "workspace.users.change_role",
		"workspace.groups.create", "workspace.groups.manage_all",
		"workspace.pages.create", "workspace.pages.delete_any",
		"workspace.audit.view", "workspace.settings.manage",
	},
	m.RoleMember:      {"workspace.groups.create", "workspace.pages.create"},
	m.RoleViewer:      {},
	m.RoleGroupAdmin:  {"group.members.add", "group.members.remove", "group.rename", "group.delete"},
	m.RoleGroupMember: {},
	m.RolePageOwner:   {"page.view", "page.edit_config", "page.delete", "page.manage_acl"},
	m.RolePageEditor:  {"page.view", "page.edit_config"},
	m.RolePageViewer:  {"page.view"},
}

// Seed idempotently upserts the system permission/role/role_permission
// catalogue. Safe to run on every boot: existing rows are matched by their
// unique `key` and left alone (Description on Permission is refreshed so a
// wording tweak in code ships without a manual data migration).
func Seed(gdb *gorm.DB) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		permByKey, err := seedPermissions(tx)
		if err != nil {
			return err
		}
		roleByKey, err := seedRoles(tx)
		if err != nil {
			return err
		}
		return seedRolePermissions(tx, roleByKey, permByKey)
	})
}

func seedPermissions(tx *gorm.DB) (map[string]m.Permission, error) {
	byKey := make(map[string]m.Permission, len(permissionSeed))
	for _, p := range permissionSeed {
		var existing m.Permission
		err := tx.Where("key = ?", p.Key).First(&existing).Error
		switch {
		case err == gorm.ErrRecordNotFound:
			if err := tx.Create(&p).Error; err != nil {
				return nil, fmt.Errorf("seed permission %s: %w", p.Key, err)
			}
			byKey[p.Key] = p
		case err != nil:
			return nil, fmt.Errorf("seed permission %s: %w", p.Key, err)
		default:
			existing.Description = p.Description
			existing.Scope = p.Scope
			if err := tx.Save(&existing).Error; err != nil {
				return nil, fmt.Errorf("seed permission %s: %w", p.Key, err)
			}
			byKey[p.Key] = existing
		}
	}
	return byKey, nil
}

func seedRoles(tx *gorm.DB) (map[string]m.Role, error) {
	byKey := make(map[string]m.Role, len(roleSeed))
	for _, r := range roleSeed {
		var existing m.Role
		err := tx.Where("key = ?", r.Key).First(&existing).Error
		switch {
		case err == gorm.ErrRecordNotFound:
			if err := tx.Create(&r).Error; err != nil {
				return nil, fmt.Errorf("seed role %s: %w", r.Key, err)
			}
			byKey[r.Key] = r
		case err != nil:
			return nil, fmt.Errorf("seed role %s: %w", r.Key, err)
		default:
			// Do not overwrite IsSystem/Name here for custom future roles that
			// might reuse this path; system roles are only ever re-synced on
			// their well-known keys, which always match this seed exactly.
			existing.Name = r.Name
			existing.BypassesPageACL = r.BypassesPageACL
			existing.Rank = r.Rank
			if err := tx.Save(&existing).Error; err != nil {
				return nil, fmt.Errorf("seed role %s: %w", r.Key, err)
			}
			byKey[r.Key] = existing
		}
	}
	return byKey, nil
}

func seedRolePermissions(tx *gorm.DB, roleByKey map[string]m.Role, permByKey map[string]m.Permission) error {
	for roleKey, permKeys := range rolePermissionSeed {
		role, ok := roleByKey[roleKey]
		if !ok {
			return fmt.Errorf("seed role_permissions: unknown role %s", roleKey)
		}
		for _, permKey := range permKeys {
			perm, ok := permByKey[permKey]
			if !ok {
				return fmt.Errorf("seed role_permissions: unknown permission %s", permKey)
			}
			rp := m.RolePermission{RoleID: role.ID, PermissionID: perm.ID}
			var existing m.RolePermission
			err := tx.Where("role_id = ? AND permission_id = ?", role.ID, perm.ID).First(&existing).Error
			if err == gorm.ErrRecordNotFound {
				if err := tx.Create(&rp).Error; err != nil {
					return fmt.Errorf("seed role_permission %s->%s: %w", roleKey, permKey, err)
				}
			} else if err != nil {
				return fmt.Errorf("seed role_permission %s->%s: %w", roleKey, permKey, err)
			}
		}
	}
	return nil
}
