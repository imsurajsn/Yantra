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
