package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(u *models.User) error {
	return r.db.Create(u).Error
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var u models.User
	if err := r.db.Preload("Role").Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepository) FindByID(id uint) (*models.User, error) {
	var u models.User
	if err := r.db.Preload("Role").First(&u, id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepository) List() ([]models.User, error) {
	var users []models.User
	if err := r.db.Preload("Role").Order("created_at asc").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

// CountActiveAdmins is used by the last-Admin guard before any deactivation
// or role change that would remove the workspace's only Admin.
func (r *UserRepository) CountActiveAdmins(tx *gorm.DB, adminRoleID uint) (int64, error) {
	var count int64
	err := tx.Model(&models.User{}).
		Where("role_id = ? AND is_active = ?", adminRoleID, true).
		Count(&count).Error
	return count, err
}

// AnyExists reports whether at least one user row exists at all — used by
// the setup guard to decide whether /setup is still open.
func (r *UserRepository) AnyExists() (bool, error) {
	var count int64
	if err := r.db.Model(&models.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *UserRepository) Save(u *models.User) error {
	return r.db.Save(u).Error
}

// WithTx returns a repository bound to the given transaction, for callers
// (like the last-Admin guard) that need multiple reads/writes to happen
// inside one row-locked transaction.
func (r *UserRepository) WithTx(tx *gorm.DB) *UserRepository {
	return &UserRepository{db: tx}
}

func (r *UserRepository) DB() *gorm.DB { return r.db }
