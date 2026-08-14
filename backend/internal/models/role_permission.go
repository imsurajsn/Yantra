package models

// RolePermission is the explicit join row for Role<->Permission (GORM also
// manages this via the many2many tag on Role.Permissions, but the type is
// declared so migrations/seeding can reference it directly and predictably).
type RolePermission struct {
	ID           uint `gorm:"primaryKey"`
	RoleID       uint `gorm:"not null;uniqueIndex:idx_role_permission"`
	PermissionID uint `gorm:"not null;uniqueIndex:idx_role_permission"`
}

func (RolePermission) TableName() string { return "role_permissions" }
