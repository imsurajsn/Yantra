// Package db owns the GORM connection, schema migration, and system-data
// seeding. Nothing outside this package should call gorm.Open directly.
package db

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/imsurajsn/yantra/internal/config"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewLogger builds the GORM logger every connection (production and test)
// should share. IgnoreRecordNotFoundError is the load-bearing setting here:
// "not found" is an expected, routine result for lookups like "does this
// email already exist" or "is there a session for this jti" — without it,
// GORM's default logger prints every one of those as an Error-level log
// line, burying real problems in noise.
func NewLogger() logger.Interface {
	return logger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), logger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
	})
}

// Connect opens a GORM connection using the dialect selected by cfg.DBType.
// mariadb reuses the mysql driver — the wire protocol is fully compatible,
// per the PRD's DB support table.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector
	switch cfg.DBType {
	case config.DBPostgres:
		dialector = postgres.Open(cfg.DBDSN)
	case config.DBMySQL, config.DBMariaDB:
		dialector = mysql.Open(cfg.DBDSN)
	default:
		return nil, fmt.Errorf("db: unsupported DB_TYPE %q", cfg.DBType)
	}

	gdb, err := gorm.Open(dialector, &gorm.Config{
		Logger: NewLogger(),
	})
	if err != nil {
		return nil, fmt.Errorf("db: connect: %w", err)
	}
	return gdb, nil
}
