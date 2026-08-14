package services_test

import (
	"testing"

	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"github.com/imsurajsn/yantra/internal/services"
	"github.com/imsurajsn/yantra/internal/testutil"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// setupPermFixtures seeds one user per workspace role (matching PRD §3's
// built-in role tables) plus the repos/service needed to exercise Can().
func setupPermFixtures(t *testing.T, gdb *gorm.DB) (
	perms *services.PermissionService,
	users *repositories.UserRepository,
	groups *repositories.GroupRepository,
	roles *repositories.RoleRepository,
	pageACLs *repositories.PageACLRepository,
	admin, member, viewer *models.User,
) {
	t.Helper()
	users = repositories.NewUserRepository(gdb)
	roles = repositories.NewRoleRepository(gdb)
	groups = repositories.NewGroupRepository(gdb)
	pageACLs = repositories.NewPageACLRepository(gdb)
	perms = services.NewPermissionService(roles, groups, pageACLs)

	admin = mustCreateUser(t, gdb, roles, "admin@fixture.test", models.RoleAdmin)
	member = mustCreateUser(t, gdb, roles, "member@fixture.test", models.RoleMember)
	viewer = mustCreateUser(t, gdb, roles, "viewer@fixture.test", models.RoleViewer)

	// Reload with Role preloaded — CanPage relies on user.Role.BypassesPageACL,
	// which a bare gdb.Create() leaves zero-valued.
	admin = mustReload(t, users, admin.ID)
	member = mustReload(t, users, member.ID)
	viewer = mustReload(t, users, viewer.ID)
	return
}

func mustCreateUser(t *testing.T, gdb *gorm.DB, roles *repositories.RoleRepository, email, roleKey string) *models.User {
	t.Helper()
	role, err := roles.FindByKey(roleKey)
	if err != nil {
		t.Fatalf("FindByKey(%s): %v", roleKey, err)
	}
	u := &models.User{
		Email:        email,
		DisplayName:  email,
		PasswordHash: "not-a-real-hash",
		RoleID:       role.ID,
	}
	if err := gdb.Create(u).Error; err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}
	return u
}

func mustReload(t *testing.T, users *repositories.UserRepository, id uint) *models.User {
	t.Helper()
	u, err := users.FindByID(id)
	if err != nil {
		t.Fatalf("reload user %d: %v", id, err)
	}
	return u
}

// assertCan checks a Can*() call's (bool, error) result. Go's "forward a
// multi-value call as the sole argument" special case doesn't apply here —
// assertCan needs extra params (want, msg) beyond what Can*() returns — so
// every call site captures ok, err explicitly first.
func assertCan(t *testing.T, got bool, err error, want bool, msg string) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s: unexpected error: %v", msg, err)
	}
	if got != want {
		t.Errorf("%s: got %v, want %v", msg, got, want)
	}
}

func TestPermissionService_CanWorkspace_MatchesSeededRoleBundles(t *testing.T) {
	gdb := testutil.RequireDB(t)
	perms, _, _, _, _, admin, member, viewer := setupPermFixtures(t, gdb)

	ok, err := perms.CanWorkspace(admin, "workspace.users.create")
	assertCan(t, ok, err, true, "admin should have workspace.users.create")

	ok, err = perms.CanWorkspace(admin, "workspace.audit.view")
	assertCan(t, ok, err, true, "admin should have workspace.audit.view")

	ok, err = perms.CanWorkspace(member, "workspace.pages.create")
	assertCan(t, ok, err, true, "member should have workspace.pages.create")

	ok, err = perms.CanWorkspace(member, "workspace.groups.create")
	assertCan(t, ok, err, true, "member should have workspace.groups.create")

	ok, err = perms.CanWorkspace(member, "workspace.users.create")
	assertCan(t, ok, err, false, "member must NOT have workspace.users.create")

	ok, err = perms.CanWorkspace(viewer, "workspace.pages.create")
	assertCan(t, ok, err, false, "viewer must have no workspace permissions")
}

func TestPermissionService_CanGroup_RequiresMembership(t *testing.T) {
	gdb := testutil.RequireDB(t)
	perms, _, groups, roles, _, _, member, viewer := setupPermFixtures(t, gdb)

	group := &models.Group{Name: "Fixture Group", CreatedByID: member.ID}
	if err := groups.Create(group); err != nil {
		t.Fatalf("create group: %v", err)
	}

	groupAdminRole, err := roles.FindByKey(models.RoleGroupAdmin)
	if err != nil {
		t.Fatalf("FindByKey(group_admin): %v", err)
	}
	if err := groups.AddMember(&models.GroupMember{GroupID: group.ID, UserID: member.ID, RoleID: groupAdminRole.ID}); err != nil {
		t.Fatalf("add member: %v", err)
	}

	ok, err := perms.CanGroup(member, group.ID, "group.delete")
	assertCan(t, ok, err, true, "group_admin should have group.delete")

	// viewer was never added to the group at all — no membership row.
	ok, err = perms.CanGroup(viewer, group.ID, "group.delete")
	assertCan(t, ok, err, false, "a user with no membership row must have no group permissions")
}

func TestPermissionService_CanPage_AdminBypassesACL(t *testing.T) {
	gdb := testutil.RequireDB(t)
	perms, _, groups, _, _, admin, _, viewer := setupPermFixtures(t, gdb)

	group := &models.Group{Name: "Page Group", CreatedByID: admin.ID}
	if err := groups.Create(group); err != nil {
		t.Fatalf("create group: %v", err)
	}
	page := &models.Page{
		Name:        "Fixture Table Page",
		PageType:    models.PageTypeTable,
		PageGroupID: group.ID,
		Config:      datatypes.JSON([]byte(`{}`)),
		CreatedByID: admin.ID,
	}
	if err := gdb.Create(page).Error; err != nil {
		t.Fatalf("create page: %v", err)
	}

	// No PageACL row exists at all yet.
	ok, err := perms.CanPage(admin, page.ID, "page.view")
	assertCan(t, ok, err, true, "workspace Admin must bypass PageACL entirely, even with zero ACL entries")

	ok, err = perms.CanPage(viewer, page.ID, "page.view")
	assertCan(t, ok, err, false, "default deny: a user with no matching ACL entry must not have page access")
}

func TestPermissionService_EffectivePageRole_HighestRankWins(t *testing.T) {
	gdb := testutil.RequireDB(t)
	perms, _, groups, roles, pageACLs, admin, member, _ := setupPermFixtures(t, gdb)

	group := &models.Group{Name: "ACL Group", CreatedByID: admin.ID}
	if err := groups.Create(group); err != nil {
		t.Fatalf("create group: %v", err)
	}
	groupMemberRole, err := roles.FindByKey(models.RoleGroupMember)
	if err != nil {
		t.Fatalf("FindByKey(group_member): %v", err)
	}
	if err := groups.AddMember(&models.GroupMember{GroupID: group.ID, UserID: member.ID, RoleID: groupMemberRole.ID}); err != nil {
		t.Fatalf("add member: %v", err)
	}

	page := &models.Page{
		Name:        "ACL Fixture Page",
		PageType:    models.PageTypeTable,
		PageGroupID: group.ID,
		Config:      datatypes.JSON([]byte(`{}`)),
		CreatedByID: admin.ID,
	}
	if err := gdb.Create(page).Error; err != nil {
		t.Fatalf("create page: %v", err)
	}

	pageViewerRole, err := roles.FindByKey(models.RolePageViewer)
	if err != nil {
		t.Fatalf("FindByKey(page_viewer): %v", err)
	}
	pageEditorRole, err := roles.FindByKey(models.RolePageEditor)
	if err != nil {
		t.Fatalf("FindByKey(page_editor): %v", err)
	}

	// Group grants Viewer (rank 10); a direct ACL entry for the same user
	// grants Editor (rank 20). Effective role must be the higher of the two.
	if err := pageACLs.Upsert(&models.PageACL{
		PageID: page.ID, SubjectType: models.SubjectGroup, SubjectID: group.ID, RoleID: pageViewerRole.ID, CreatedByID: admin.ID,
	}); err != nil {
		t.Fatalf("upsert group ACL: %v", err)
	}
	if err := pageACLs.Upsert(&models.PageACL{
		PageID: page.ID, SubjectType: models.SubjectUser, SubjectID: member.ID, RoleID: pageEditorRole.ID, CreatedByID: admin.ID,
	}); err != nil {
		t.Fatalf("upsert user ACL: %v", err)
	}

	role, ok, err := perms.EffectivePageRole(member, page.ID)
	if err != nil {
		t.Fatalf("EffectivePageRole: %v", err)
	}
	if !ok {
		t.Fatal("expected an effective role to resolve")
	}
	if role.Key != models.RolePageEditor {
		t.Fatalf("effective role = %s, want %s (highest rank across direct + group ACL entries)", role.Key, models.RolePageEditor)
	}
}
