package repositories

import (
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

// AuditRepository exposes ONLY Create and Query. There is deliberately no
// Update/Delete method on this type, anywhere — the audit log's
// append-only guarantee is enforced by the absence of the method, not by a
// runtime check, so calling one would be a Go compile error.
type AuditRepository struct {
	db *gorm.DB
}

func NewAuditRepository(db *gorm.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

func (r *AuditRepository) Create(entry *models.AuditLog) error {
	return r.db.Create(entry).Error
}

// AuditFilter mirrors the GET /audit-log query params from the API
// contract (§2): user, event type, and a date range.
type AuditFilter struct {
	ActorUserID *uint
	EventType   *models.AuditEventType
	From        *string // RFC3339 or date; parsed by the caller
	To          *string
	Page        int
	PageSize    int
}

type AuditPage struct {
	Items    []models.AuditLog
	Total    int64
	Page     int
	PageSize int
}

func (r *AuditRepository) Query(f AuditFilter) (*AuditPage, error) {
	q := r.db.Model(&models.AuditLog{})
	if f.ActorUserID != nil {
		q = q.Where("actor_user_id = ?", *f.ActorUserID)
	}
	if f.EventType != nil {
		q = q.Where("event_type = ?", *f.EventType)
	}
	if f.From != nil {
		q = q.Where("created_at >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("created_at <= ?", *f.To)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}

	page, pageSize := f.Page, f.PageSize
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	var items []models.AuditLog
	if err := q.Order("created_at desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&items).Error; err != nil {
		return nil, err
	}

	return &AuditPage{Items: items, Total: total, Page: page, PageSize: pageSize}, nil
}
