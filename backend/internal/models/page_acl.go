package models

// ACLSubjectType identifies whether a PageACL entry grants access to a
// single user or to every member of a group.
type ACLSubjectType string

const (
	SubjectUser  ACLSubjectType = "user"
	SubjectGroup ACLSubjectType = "group"
)

// PageACL grants a page-scoped role to a subject (user or group).
// SubjectID is polymorphic (points into users.id or groups.id depending on
// SubjectType) and deliberately has no DB-level FK — enforced at the
// service layer since it targets two different tables.
//
// A user's effective role on a page = MAX(role.rank) across every PageACL
// row matching (subject_type=user, subject_id=user.id) OR
// (subject_type=group, subject_id IN <user's group ids>). No match = deny.
// Workspace Admins bypass this table entirely via Role.BypassesPageACL.
type PageACL struct {
	ID          uint           `gorm:"primaryKey"`
	PageID      uint           `gorm:"not null;uniqueIndex:idx_page_subject"`
	Page        Page           `gorm:"foreignKey:PageID;constraint:OnDelete:CASCADE"`
	SubjectType ACLSubjectType `gorm:"not null;size:10;uniqueIndex:idx_page_subject"`
	SubjectID   uint           `gorm:"not null;uniqueIndex:idx_page_subject"`
	RoleID      uint           `gorm:"not null"` // FK roles(id), page-scoped role
	Role        Role           `gorm:"foreignKey:RoleID"`
	CreatedByID uint           `gorm:"not null"`
}

// TableName is pinned explicitly rather than left to GORM's pluralizer:
// "ACL" is an initialism GORM's naming strategy may or may not special-case
// consistently across versions, and internal/repositories references this
// table by raw name in a JOIN — an implicit name here would be a silent
// footgun if that inference ever changed.
func (PageACL) TableName() string { return "page_acls" }
