package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type GroupRepository struct {
	db *gorm.DB
}

func NewGroupRepository(db *gorm.DB) *GroupRepository {
	return &GroupRepository{db: db}
}

func (r *GroupRepository) Create(g *models.Group) error {
	return r.db.Create(g).Error
}

func (r *GroupRepository) FindByID(id uint) (*models.Group, error) {
	var g models.Group
	if err := r.db.First(&g, id).Error; err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *GroupRepository) List() ([]models.Group, error) {
	var groups []models.Group
	if err := r.db.Order("name asc").Find(&groups).Error; err != nil {
		return nil, err
	}
	return groups, nil
}

// AddMember inserts a membership row. Used both for explicit "add member"
// calls and to auto-assign the creator as group_admin on group creation.
func (r *GroupRepository) AddMember(m *models.GroupMember) error {
	return r.db.Create(m).Error
}

func (r *GroupRepository) RemoveMember(groupID, userID uint) error {
	return r.db.Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&models.GroupMember{}).Error
}

// FindMembership returns a user's membership row for one group, if any —
// the group-scope half of permission_service.Can().
func (r *GroupRepository) FindMembership(groupID, userID uint) (*models.GroupMember, error) {
	var gm models.GroupMember
	err := r.db.Preload("Role").Where("group_id = ? AND user_id = ?", groupID, userID).First(&gm).Error
	if err != nil {
		return nil, err
	}
	return &gm, nil
}

// GroupIDsForUser returns every group a user belongs to — used to resolve
// page ACL entries granted via group membership.
func (r *GroupRepository) GroupIDsForUser(userID uint) ([]uint, error) {
	var ids []uint
	err := r.db.Model(&models.GroupMember{}).Where("user_id = ?", userID).Pluck("group_id", &ids).Error
	return ids, err
}

func (r *GroupRepository) Members(groupID uint) ([]models.GroupMember, error) {
	var members []models.GroupMember
	err := r.db.Preload("User").Preload("Role").Where("group_id = ?", groupID).Find(&members).Error
	return members, err
}

func (r *GroupRepository) Delete(id uint) error {
	return r.db.Delete(&models.Group{}, id).Error
}

func (r *GroupRepository) Save(g *models.Group) error {
	return r.db.Save(g).Error
}

// CountPages reports how many pages use this group as their nav-organization
// group (Page.PageGroupID). The DB FK is ON DELETE RESTRICT, but the
// service layer checks this first for a clean 409 instead of a raw
// dialect-specific FK-violation error surfacing to the API.
func (r *GroupRepository) CountPages(groupID uint) (int64, error) {
	var count int64
	err := r.db.Table("pages").Where("page_group_id = ?", groupID).Count(&count).Error
	return count, err
}

func (r *GroupRepository) SaveMember(m *models.GroupMember) error {
	return r.db.Save(m).Error
}
