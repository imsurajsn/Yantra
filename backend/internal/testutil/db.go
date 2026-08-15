// Package testutil provides a real-Postgres test database for integration
// tests. SQLite is deliberately never used as a stand-in (see the PRD: not
// suitable for production, and behaves differently enough from Postgres —
// JSON columns, locking — that testing against it wouldn't actually verify
// what production runs on).
package testutil

import (
	"os"
	"testing"

	"github.com/imsurajsn/yantra/internal/db"
	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// RequireDB connects to TEST_DB_DSN, migrates + seeds a fresh schema, and
// registers cleanup to clear operational tables after the test. Skips (not
// fails) the test if TEST_DB_DSN is unset, so `go test ./...` stays green
// on a machine with no Postgres available — CI always sets it (see
// .github/workflows/lint-and-test.yml).
func RequireDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN not set — skipping integration test (needs a real Postgres, see CONTRIBUTING)")
	}

	gdb, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: db.NewLogger()})
	if err != nil {
		t.Fatalf("testutil: connect: %v", err)
	}

	if err := db.AutoMigrate(gdb); err != nil {
		t.Fatalf("testutil: automigrate: %v", err)
	}
	if err := db.Seed(gdb); err != nil {
		t.Fatalf("testutil: seed: %v", err)
	}

	t.Cleanup(func() {
		clearOperationalTables(t, gdb)
	})

	return gdb
}

// clearOperationalTables resets test-created data between tests, leaving
// the schema and the system permission/role seed rows in place (Seed is
// idempotent, so re-seeding isn't needed). AuditLog is deliberately NEVER
// cleared here, even in tests: the application layer has no Delete method
// for it anywhere, on principle, and a test helper reaching around that via
// raw GORM would undercut the same guarantee it's meant to model. Test
// audit rows accumulating is harmless — nothing asserts an empty table.
func clearOperationalTables(t *testing.T, gdb *gorm.DB) {
	t.Helper()
	session := gdb.Session(&gorm.Session{AllowGlobalUpdate: true})
	modelList := []interface{}{
		&models.PageACL{},
		&models.PageAuthHeader{},
		&models.Page{},
		&models.GroupMember{},
		&models.Group{},
		&models.Session{},
		&models.User{},
	}
	for _, m := range modelList {
		if err := session.Delete(m).Error; err != nil {
			t.Fatalf("testutil: clear %T: %v", m, err)
		}
	}
}
