package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type PageACLRepository struct {
	db *gorm.DB
}

func NewPageACLRepository(db *gorm.DB) *PageACLRepository {
	return &PageACLRepository{db: db}
}

// EffectiveRoleRank returns the highest page-scope role rank across every
// PageACL row that matches this user directly OR any of their group IDs —
// "a user's effective page role = highest role across all matching ACL
// entries." ok=false means no entry resolved (default deny).
func (r *PageACLRepository) EffectiveRoleRank(pageID, userID uint, groupIDs []uint) (rank int, ok bool, err error) {
	q := r.db.Table("page_acls").
		Joins("JOIN roles ON roles.id = page_acls.role_id").
		Where("page_acls.page_id = ?", pageID)

	if len(groupIDs) > 0 {
		q = q.Where(
			"(page_acls.subject_type = ? AND page_acls.subject_id = ?) OR (page_acls.subject_type = ? AND page_acls.subject_id IN ?)",
			models.SubjectUser, userID, models.SubjectGroup, groupIDs,
		)
	} else {
		q = q.Where("page_acls.subject_type = ? AND page_acls.subject_id = ?", models.SubjectUser, userID)
	}

	var maxRank *int
	if err := q.Select("MAX(roles.rank)").Scan(&maxRank).Error; err != nil {
		return 0, false, err
	}
	if maxRank == nil {
		return 0, false, nil
	}
	return *maxRank, true, nil
}

func (r *PageACLRepository) ListForPage(pageID uint) ([]models.PageACL, error) {
	var entries []models.PageACL
	err := r.db.Preload("Role").Where("page_id = ?", pageID).Find(&entries).Error
	return entries, err
}

func (r *PageACLRepository) Upsert(entry *models.PageACL) error {
	return r.db.Where("page_id = ? AND subject_type = ? AND subject_id = ?", entry.PageID, entry.SubjectType, entry.SubjectID).
		Assign("role_id", entry.RoleID).
		FirstOrCreate(entry).Error
}

func (r *PageACLRepository) Remove(id uint) error {
	return r.db.Delete(&models.PageACL{}, id).Error
}
