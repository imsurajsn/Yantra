package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type RoleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) *RoleRepository {
	return &RoleRepository{db: db}
}

func (r *RoleRepository) FindByKey(key string) (*models.Role, error) {
	var role models.Role
	if err := r.db.Where("key = ?", key).First(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *RoleRepository) FindByID(id uint) (*models.Role, error) {
	var role models.Role
	if err := r.db.First(&role, id).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

// HasPermission reports whether roleID's bundle includes the given
// permission key. This is the single query permission_service.Can()
// ultimately reduces every check to.
func (r *RoleRepository) HasPermission(roleID uint, permissionKey string) (bool, error) {
	var count int64
	err := r.db.Table("role_permissions").
		Joins("JOIN permissions ON permissions.id = role_permissions.permission_id").
		Where("role_permissions.role_id = ? AND permissions.key = ?", roleID, permissionKey).
		Count(&count).Error
	return count > 0, err
}

// PermissionKeys returns every permission key in roleID's bundle. Used by
// GET /auth/me to return a flattened permissions list, so the frontend
// never re-derives RBAC logic itself — it only ever reads this array (see
// plan §4, "Page-level ACL is never re-derived client-side").
func (r *RoleRepository) PermissionKeys(roleID uint) ([]string, error) {
	var keys []string
	err := r.db.Table("role_permissions").
		Joins("JOIN permissions ON permissions.id = role_permissions.permission_id").
		Where("role_permissions.role_id = ?", roleID).
		Pluck("permissions.key", &keys).Error
	return keys, err
}
