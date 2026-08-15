package services

import (
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
)

type PageACLService struct {
	pageACLs *repositories.PageACLRepository
	roles    *repositories.RoleRepository
}

func NewPageACLService(pageACLs *repositories.PageACLRepository, roles *repositories.RoleRepository) *PageACLService {
	return &PageACLService{pageACLs: pageACLs, roles: roles}
}

// GrantOwner is called once, right after a page is created — the creator
// gets an Owner ACL entry so they aren't immediately locked out of the page
// they just made (nobody else can see it until a further ACL entry grants
// them access).
func (s *PageACLService) GrantOwner(pageID, userID uint) error {
	role, err := s.roles.FindByKey(models.RolePageOwner)
	if err != nil {
		return err
	}
	return s.pageACLs.Upsert(&models.PageACL{
		PageID: pageID, SubjectType: models.SubjectUser, SubjectID: userID, RoleID: role.ID, CreatedByID: userID,
	})
}

func (s *PageACLService) List(pageID uint) ([]models.PageACL, error) {
	return s.pageACLs.ListForPage(pageID)
}

// Add upserts an ACL entry — matching Upsert's semantics, adding an entry
// for a subject that already has one on this page replaces its role rather
// than erroring, which is what the mockup's "Manage access" matrix expects
// (picking a different role for a row just changes it in place).
func (s *PageACLService) Add(pageID uint, subjectType models.ACLSubjectType, subjectID uint, roleKey string, actorID uint) (*models.PageACL, error) {
	role, err := s.roles.FindByKey(roleKey)
	if err != nil {
		return nil, err
	}
	entry := &models.PageACL{PageID: pageID, SubjectType: subjectType, SubjectID: subjectID, RoleID: role.ID, CreatedByID: actorID}
	if err := s.pageACLs.Upsert(entry); err != nil {
		return nil, err
	}
	return entry, nil
}

func (s *PageACLService) Remove(id uint) error {
	return s.pageACLs.Remove(id)
}
