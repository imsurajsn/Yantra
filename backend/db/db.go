package db

import (
	"log"

	"github.com/yantra-platform/yantra/config"
	"github.com/yantra-platform/yantra/models"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() {
	cfg := config.C
	var dialector gorm.Dialector

	switch cfg.DBType {
	case "postgres":
		dialector = postgres.Open(cfg.DSN())
	case "mysql", "mariadb":
		dialector = mysql.Open(cfg.DSN())
	default:
		log.Fatalf("Unsupported DB_TYPE: %s", cfg.DBType)
	}

	var err error
	DB, err = gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	log.Printf("Connected to %s database", cfg.DBType)
}

func Migrate() {
	err := DB.AutoMigrate(
		&models.User{},
		&models.Group{},
		&models.GroupMember{},
		&models.Page{},
		&models.PageACLEntry{},
		&models.AuditLog{},
	)
	if err != nil {
		log.Fatalf("Database migration failed: %v", err)
	}
	log.Println("Database migration complete")
}

// IsSetupComplete returns true if at least one Admin user exists.
func IsSetupComplete() bool {
	var count int64
	DB.Model(&models.User{}).Where("workspace_role = ? AND is_active = ?", models.RoleAdmin, true).Count(&count)
	return count > 0
}
