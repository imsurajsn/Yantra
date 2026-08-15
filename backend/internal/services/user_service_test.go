package services_test

import (
	"errors"
	"testing"

	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/imsurajsn/yantra/internal/testutil"
	"gorm.io/gorm"
)

func newUserService(gdb *gorm.DB) (*services.UserService, *repositories.UserRepository) {
	users := repositories.NewUserRepository(gdb)
	roles := repositories.NewRoleRepository(gdb)
	sessions := repositories.NewSessionRepository(gdb)
	return services.NewUserService(gdb, users, roles, sessions), users
}

func TestUserService_Deactivate_BlocksRemovingTheLastActiveAdmin(t *testing.T) {
	gdb := testutil.RequireDB(t)
	roles := repositories.NewRoleRepository(gdb)
	userSvc, users := newUserService(gdb)

	admin := mustCreateUser(t, gdb, roles, "sole-admin@fixture.test", models.RoleAdmin)

	err := userSvc.Deactivate(admin.ID)
	if !errors.Is(err, services.ErrLastAdmin) {
		t.Fatalf("Deactivate(sole admin) error = %v, want ErrLastAdmin", err)
	}

	reloaded, err := users.FindByID(admin.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if !reloaded.IsActive {
		t.Fatal("the sole Admin must still be active after a blocked deactivation attempt")
	}
}

func TestUserService_Deactivate_AllowsRemovingOneOfSeveralAdmins(t *testing.T) {
	gdb := testutil.RequireDB(t)
	roles := repositories.NewRoleRepository(gdb)
	userSvc, users := newUserService(gdb)

	first := mustCreateUser(t, gdb, roles, "admin-one@fixture.test", models.RoleAdmin)
	_ = mustCreateUser(t, gdb, roles, "admin-two@fixture.test", models.RoleAdmin)

	if err := userSvc.Deactivate(first.ID); err != nil {
		t.Fatalf("Deactivate: unexpected error with a second Admin still active: %v", err)
	}

	reloaded, err := users.FindByID(first.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if reloaded.IsActive {
		t.Fatal("expected the deactivated user to be inactive")
	}
}

// Regression test for a real bug: models.User.MustChangePassword used to
// carry a `gorm:"default:true"` tag. GORM silently omits a field from its
// INSERT when the Go value is that field's zero value (false, here) AND the
// field has a `default:` tag — so CreateFirstAdmin's explicit `false` never
// reached the database, and the DB column default (true) applied instead,
// forcing the first-run Admin through a redundant password-change screen
// right after they'd just chosen a password during setup.
func TestUserService_CreateFirstAdmin_DoesNotRequirePasswordChange(t *testing.T) {
	gdb := testutil.RequireDB(t)
	userSvc, users := newUserService(gdb)

	admin, err := userSvc.CreateFirstAdmin("first-admin@fixture.test", "First Admin", "password123")
	if err != nil {
		t.Fatalf("CreateFirstAdmin: %v", err)
	}

	// Re-fetch from the DB rather than trusting the in-memory struct — the
	// bug this guards against only manifests once the value round-trips
	// through an actual INSERT.
	reloaded, err := users.FindByID(admin.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if reloaded.MustChangePassword {
		t.Fatal("the first-run Admin must NOT be forced to change their password again — they just set it during setup")
	}
}

func TestUserService_CreateUser_RequiresPasswordChangeOnFirstLogin(t *testing.T) {
	gdb := testutil.RequireDB(t)
	roles := repositories.NewRoleRepository(gdb)
	userSvc, users := newUserService(gdb)
	admin := mustCreateUser(t, gdb, roles, "creator2@fixture.test", models.RoleAdmin)

	created, err := userSvc.CreateUser("newbie@fixture.test", "Newbie", "temp12345", models.RoleMember, admin.ID)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	reloaded, err := users.FindByID(created.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if !reloaded.MustChangePassword {
		t.Fatal("an admin-created user MUST be forced to change the admin-set initial password on first login (PRD requirement 40)")
	}
}

func TestUserService_CreateUser_RejectsDuplicateEmail(t *testing.T) {
	gdb := testutil.RequireDB(t)
	roles := repositories.NewRoleRepository(gdb)
	userSvc, _ := newUserService(gdb)
	admin := mustCreateUser(t, gdb, roles, "creator@fixture.test", models.RoleAdmin)

	if _, err := userSvc.CreateUser("dup@fixture.test", "Dup One", "password123", models.RoleMember, admin.ID); err != nil {
		t.Fatalf("first CreateUser: %v", err)
	}
	_, err := userSvc.CreateUser("dup@fixture.test", "Dup Two", "password123", models.RoleMember, admin.ID)
	if !errors.Is(err, services.ErrEmailTaken) {
		t.Fatalf("second CreateUser error = %v, want ErrEmailTaken", err)
	}
}
