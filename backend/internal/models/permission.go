package models

// PermissionScope identifies which layer a permission applies to.
type PermissionScope string

const (
	ScopeWorkspace PermissionScope = "workspace"
	ScopeGroup     PermissionScope = "group"
	ScopePage      PermissionScope = "page"
)

// Permission is an atomic, system-defined permission string (e.g. "workspace.users.create").
// V1 never lets users define new permission keys — only new Roles built from these.
type Permission struct {
	ID          uint            `gorm:"primaryKey"`
	Key         string          `gorm:"uniqueIndex;not null;size:100"`
	Scope       PermissionScope `gorm:"not null;size:20"`
	Description string          `gorm:"not null"`
}
