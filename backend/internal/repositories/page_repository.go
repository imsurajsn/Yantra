package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

type PageRepository struct {
	db *gorm.DB
}

func NewPageRepository(db *gorm.DB) *PageRepository {
	return &PageRepository{db: db}
}

func (r *PageRepository) Create(p *models.Page) error {
	return r.db.Create(p).Error
}

func (r *PageRepository) FindByID(id uint) (*models.Page, error) {
	var p models.Page
	if err := r.db.First(&p, id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PageRepository) List() ([]models.Page, error) {
	var pages []models.Page
	if err := r.db.Order("name asc").Find(&pages).Error; err != nil {
		return nil, err
	}
	return pages, nil
}

func (r *PageRepository) Save(p *models.Page) error {
	return r.db.Save(p).Error
}

func (r *PageRepository) Delete(id uint) error {
	return r.db.Delete(&models.Page{}, id).Error
}

// AuthHeaders returns the (still-encrypted) auth headers for a page.
func (r *PageRepository) AuthHeaders(pageID uint) ([]models.PageAuthHeader, error) {
	var headers []models.PageAuthHeader
	err := r.db.Where("page_id = ?", pageID).Find(&headers).Error
	return headers, err
}

// ReplaceAuthHeaders deletes every existing header row for the page and
// inserts the given set — simpler and less error-prone than diffing, and
// auth headers are never large in number (a handful of named headers).
func (r *PageRepository) ReplaceAuthHeaders(tx *gorm.DB, pageID uint, headers []models.PageAuthHeader) error {
	if err := tx.Where("page_id = ?", pageID).Delete(&models.PageAuthHeader{}).Error; err != nil {
		return err
	}
	if len(headers) == 0 {
		return nil
	}
	return tx.Create(&headers).Error
}

func (r *PageRepository) DB() *gorm.DB { return r.db }
