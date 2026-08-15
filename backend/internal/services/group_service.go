package services

import (
	"errors"

	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
)

var (
	ErrGroupHasPages  = errors.New("group: cannot delete a group that still organizes pages")
	ErrAlreadyMember  = errors.New("group: user is already a member")
	ErrNotMember      = errors.New("group: user is not a member of this group")
)

type GroupService struct {
	groups   *repositories.GroupRepository
	roles    *repositories.RoleRepository
	pageACLs *repositories.PageACLRepository
}

func NewGroupService(groups *repositories.GroupRepository, roles *repositories.RoleRepository, pageACLs *repositories.PageACLRepository) *GroupService {
	return &GroupService{groups: groups, roles: roles, pageACLs: pageACLs}
}

// Create backs POST /groups. The creator is auto-assigned group_admin —
// "the creator is automatically assigned the Group Admin role for that
// group" (PRD requirement 16).
func (s *GroupService) Create(name string, creatorID uint) (*models.Group, error) {
	g := &models.Group{Name: name, CreatedByID: creatorID}
	if err := s.groups.Create(g); err != nil {
		return nil, err
	}
	groupAdminRole, err := s.roles.FindByKey(models.RoleGroupAdmin)
	if err != nil {
		return nil, err
	}
	if err := s.groups.AddMember(&models.GroupMember{GroupID: g.ID, UserID: creatorID, RoleID: groupAdminRole.ID}); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) Rename(id uint, name string) (*models.Group, error) {
	g, err := s.groups.FindByID(id)
	if err != nil {
		return nil, err
	}
	g.Name = name
	if err := s.groups.Save(g); err != nil {
		return nil, err
	}
	return g, nil
}

// Delete blocks (rather than cascades) if pages still reference this group
// as their nav-organization group — the admin must reassign/delete those
// pages first (PRD/plan decision: ON DELETE RESTRICT, checked here for a
// clean error before the DB constraint would otherwise reject it). Page ACL
// entries granted TO this group ARE cleaned up automatically, since that's
// a different relationship (grants, not organization) with no DB-level FK
// to enforce it (PRD requirement 19).
func (s *GroupService) Delete(id uint) error {
	pageCount, err := s.groups.CountPages(id)
	if err != nil {
		return err
	}
	if pageCount > 0 {
		return ErrGroupHasPages
	}
	if err := s.pageACLs.RemoveBySubject(models.SubjectGroup, id); err != nil {
		return err
	}
	return s.groups.Delete(id)
}

func (s *GroupService) List() ([]models.Group, error) {
	return s.groups.List()
}

func (s *GroupService) Get(id uint) (*models.Group, []models.GroupMember, error) {
	g, err := s.groups.FindByID(id)
	if err != nil {
		return nil, nil, err
	}
	members, err := s.groups.Members(id)
	if err != nil {
		return nil, nil, err
	}
	return g, members, nil
}

// AddMember defaults new members to group_member — group_admin is only ever
// reached via the auto-assignment on Create, or by an explicit role change.
func (s *GroupService) AddMember(groupID, userID uint) error {
	if _, err := s.groups.FindMembership(groupID, userID); err == nil {
		return ErrAlreadyMember
	}
	role, err := s.roles.FindByKey(models.RoleGroupMember)
	if err != nil {
		return err
	}
	return s.groups.AddMember(&models.GroupMember{GroupID: groupID, UserID: userID, RoleID: role.ID})
}

func (s *GroupService) RemoveMember(groupID, userID uint) error {
	return s.groups.RemoveMember(groupID, userID)
}

func (s *GroupService) ChangeMemberRole(groupID, userID uint, roleKey string) error {
	membership, err := s.groups.FindMembership(groupID, userID)
	if err != nil {
		return ErrNotMember
	}
	role, err := s.roles.FindByKey(roleKey)
	if err != nil {
		return err
	}
	membership.RoleID = role.ID
	return s.groups.SaveMember(membership)
}
