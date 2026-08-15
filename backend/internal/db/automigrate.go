package db

import (
	"fmt"

	appmodels "github.com/imsurajsn/yantra/internal/models"
	"gorm.io/gorm"
)

// AutoMigrate runs GORM's additive-only schema sync, in FK-dependency
// order. This is a deliberate, PRD-locked tradeoff over a versioned
// migration tool (golang-migrate/gormigrate): AutoMigrate never drops
// columns or indexes, so it is safe to run on every boot, but it has no
// rollback and no version history. Compensating control: deployment docs
// mandate a DB backup before any version upgrade.
func AutoMigrate(gdb *gorm.DB) error {
	modelList := []interface{}{
		&appmodels.Permission{},
		&appmodels.Role{},
		&appmodels.RolePermission{},
		&appmodels.User{},
		&appmodels.Session{},
		&appmodels.Group{},
		&appmodels.GroupMember{},
		&appmodels.Page{},
		&appmodels.PageAuthHeader{},
		&appmodels.PageACL{},
		&appmodels.AuditLog{},
		&appmodels.Setting{},
	}
	for _, m := range modelList {
		if err := gdb.AutoMigrate(m); err != nil {
			return fmt.Errorf("db: automigrate %T: %w", m, err)
		}
	}
	return nil
}
