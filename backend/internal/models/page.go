package models

import (
	"time"

	"gorm.io/datatypes"
)

type PageType string

const (
	PageTypeTable PageType = "table"
	PageTypeForm  PageType = "form"
)

// Page is deliberately one polymorphic table for both Data Table and Form
// pages, not per-type tables: the home/sidebar nav lists all pages together
// (a UNION per type would be needed otherwise), and config validation
// already lives in the service layer (validate -> preview -> save), so a
// rigid per-type table buys no extra integrity. Config is cross-DB JSON
// (Postgres JSONB, MySQL/MariaDB JSON via gorm.io/datatypes).
//
// Config never contains secrets — auth header values live in
// PageAuthHeader, encrypted, so ciphertext never round-trips through the
// plaintext-looking YAML editor.
//
// Table config shape:
//   source: {endpoint, method}
//   pagination: {page_size}
//   columns: [{key, label, sortable, editable}]
//   writeback: {enabled, method, endpoint, id_field}
//
// Form config shape:
//   source: {endpoint, method}
//   success_message
//   fields: [{key, label, type, required, sensitive, options?}]
type Page struct {
	ID   uint   `gorm:"primaryKey"`
	Name string `gorm:"not null;size:200"`
	// No `default:` tag — Description is legitimately often "" (optional
	// field), and a `default:` tag on a field whose Go zero value is a
	// real, intended value is exactly the footgun that bit
	// User.MustChangePassword earlier (GORM omits zero-valued fields with a
	// `default:` tag from INSERT). Harmless here only by coincidence since
	// both paths converge on "" — not worth relying on that.
	Description string         `gorm:"not null"`
	PageType    PageType       `gorm:"not null;size:20"`
	PageGroupID uint           `gorm:"not null"` // FK groups(id), ON DELETE RESTRICT — admin must reassign/delete pages first
	Group       Group          `gorm:"foreignKey:PageGroupID;constraint:OnDelete:RESTRICT"`
	Config      datatypes.JSON `gorm:"not null"`
	CreatedByID uint           `gorm:"not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TableConfig is the typed shape of Page.Config when PageType == table.
// Every field below carries BOTH json (DB storage) and yaml (admin editor
// round-trip) tags — without an explicit yaml tag, yaml.v3 falls back to
// the lowercased Go field name, not the json tag, which silently breaks any
// multi-word field (IDField would become "idfield", not "id_field").
type TableConfig struct {
	Source PageSource `json:"source" yaml:"source"`
	// ItemsPath addresses a very common real-world case: many REST APIs
	// don't return a bare JSON array, they wrap it in an envelope, e.g.
	// {"users": [...]} or {"data": {"items": [...]}}. Empty (the default)
	// means the endpoint's response IS the array directly — backward
	// compatible with every page configured before this field existed.
	// When set, it's a dot-separated path to the array within the response
	// object, e.g. "users" or "data.items". See
	// services.ExtractItems for the extraction logic, applied server-side
	// (both in the preview endpoint and the runtime data-fetch endpoint) so
	// the frontend can always assume GET /pages/:id/data returns a bare
	// array — it must never have to guess at the response shape itself.
	ItemsPath  string          `json:"items_path,omitempty" yaml:"items_path,omitempty"`
	Pagination TablePagination `json:"pagination" yaml:"pagination"`
	Columns    []TableColumn   `json:"columns" yaml:"columns"`
	Writeback  TableWriteback  `json:"writeback" yaml:"writeback"`
}

type PageSource struct {
	Endpoint string `json:"endpoint" yaml:"endpoint"`
	Method   string `json:"method" yaml:"method"`
}

type TablePagination struct {
	PageSize int `json:"page_size" yaml:"page_size"`
}

type TableColumn struct {
	Key      string `json:"key" yaml:"key"`
	Label    string `json:"label" yaml:"label"`
	Sortable bool   `json:"sortable" yaml:"sortable"`
	Editable bool   `json:"editable" yaml:"editable"`
}

type TableWriteback struct {
	Enabled  bool   `json:"enabled" yaml:"enabled"`
	Method   string `json:"method" yaml:"method"`
	Endpoint string `json:"endpoint" yaml:"endpoint"`
	IDField  string `json:"id_field" yaml:"id_field"`
}

// FormConfig is the typed shape of Page.Config when PageType == form.
type FormConfig struct {
	Source         PageSource  `json:"source" yaml:"source"`
	SuccessMessage string      `json:"success_message" yaml:"success_message"`
	Fields         []FormField `json:"fields" yaml:"fields"`
}

type FormFieldType string

const (
	FieldText     FormFieldType = "text"
	FieldNumber   FormFieldType = "number"
	FieldDropdown FormFieldType = "dropdown"
	FieldBoolean  FormFieldType = "boolean"
)

type FormField struct {
	Key       string        `json:"key" yaml:"key"`
	Label     string        `json:"label" yaml:"label"`
	Type      FormFieldType `json:"type" yaml:"type"`
	Required  bool          `json:"required" yaml:"required"`
	Sensitive bool          `json:"sensitive" yaml:"sensitive"`
	Options   []string      `json:"options,omitempty" yaml:"options,omitempty"`
}
