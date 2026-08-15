package services

import (
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
)

// PermissionService implements user.Can("permission.string") — the single
// mechanism every access check in the codebase must go through. Nothing
// should ever compare user.Role.Key == "admin" directly; that string
// comparison is exactly what V2 custom roles would break.
type PermissionService struct {
	roles    *repositories.RoleRepository
	groups   *repositories.GroupRepository
	pageACLs *repositories.PageACLRepository
}

func NewPermissionService(roles *repositories.RoleRepository, groups *repositories.GroupRepository, pageACLs *repositories.PageACLRepository) *PermissionService {
	return &PermissionService{roles: roles, groups: groups, pageACLs: pageACLs}
}

// CanWorkspace checks a workspace-scoped permission (e.g.
// "workspace.users.create") against the user's single workspace role.
func (s *PermissionService) CanWorkspace(user *models.User, permissionKey string) (bool, error) {
	return s.roles.HasPermission(user.RoleID, permissionKey)
}

// CanGroup checks a group-scoped permission (e.g. "group.members.add")
// against the user's membership role for that specific group. A workspace
// Admin does NOT automatically get group permissions this way — Admins act
// on groups via the separate "workspace.groups.manage_all" workspace
// permission, checked by the caller alongside this one.
func (s *PermissionService) CanGroup(user *models.User, groupID uint, permissionKey string) (bool, error) {
	membership, err := s.groups.FindMembership(groupID, user.ID)
	if err != nil {
		return false, nil // no membership row = no group permission (not a hard error)
	}
	return s.roles.HasPermission(membership.RoleID, permissionKey)
}

// CanPage checks a page-scoped permission (e.g. "page.edit_config").
// Workspace Admins bypass PageACL entirely (Role.BypassesPageACL) and
// always pass every page check. Otherwise: effective role = highest rank
// across the user's direct ACL entry and every group they belong to; no
// match = default deny.
func (s *PermissionService) CanPage(user *models.User, pageID uint, permissionKey string) (bool, error) {
	if user.Role.BypassesPageACL {
		return true, nil
	}

	role, ok, err := s.EffectivePageRole(user, pageID)
	if err != nil || !ok {
		return false, err
	}
	return s.roles.HasPermission(role.ID, permissionKey)
}

// EffectivePageRole returns the resolved Role for a user on a page, or
// ok=false if no ACL entry grants access (default deny). Handlers use this
// directly to populate GET /pages/:id's effective_role/can_edit/can_delete/
// can_manage_acl flags without repeating the resolution logic.
func (s *PermissionService) EffectivePageRole(user *models.User, pageID uint) (role *models.Role, ok bool, err error) {
	groupIDs, err := s.groups.GroupIDsForUser(user.ID)
	if err != nil {
		return nil, false, err
	}

	rank, found, err := s.pageACLs.EffectiveRoleRank(pageID, user.ID, groupIDs)
	if err != nil || !found {
		return nil, false, err
	}

	resolved, err := s.rankToRole(rank)
	if err != nil {
		return nil, false, err
	}
	return resolved, true, nil
}

func (s *PermissionService) rankToRole(rank int) (*models.Role, error) {
	switch rank {
	case models.RankPageOwner:
		return s.roles.FindByKey(models.RolePageOwner)
	case models.RankPageEditor:
		return s.roles.FindByKey(models.RolePageEditor)
	default:
		return s.roles.FindByKey(models.RolePageViewer)
	}
}
