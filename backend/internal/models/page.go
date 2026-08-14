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
	ID          uint     `gorm:"primaryKey"`
	Name        string   `gorm:"not null;size:200"`
	PageType    PageType `gorm:"not null;size:20"`
	PageGroupID uint     `gorm:"not null"` // FK groups(id), ON DELETE RESTRICT — admin must reassign/delete pages first
	Group       Group    `gorm:"foreignKey:PageGroupID;constraint:OnDelete:RESTRICT"`
	Config      datatypes.JSON `gorm:"not null"`
	CreatedByID uint     `gorm:"not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TableConfig is the typed shape of Page.Config when PageType == table.
type TableConfig struct {
	Source     PageSource         `json:"source"`
	Pagination TablePagination    `json:"pagination"`
	Columns    []TableColumn      `json:"columns"`
	Writeback  TableWriteback     `json:"writeback"`
}

type PageSource struct {
	Endpoint string `json:"endpoint"`
	Method   string `json:"method"`
}

type TablePagination struct {
	PageSize int `json:"page_size"`
}

type TableColumn struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Sortable bool   `json:"sortable"`
	Editable bool   `json:"editable"`
}

type TableWriteback struct {
	Enabled  bool   `json:"enabled"`
	Method   string `json:"method"`
	Endpoint string `json:"endpoint"`
	IDField  string `json:"id_field"`
}

// FormConfig is the typed shape of Page.Config when PageType == form.
type FormConfig struct {
	Source         PageSource  `json:"source"`
	SuccessMessage string      `json:"success_message"`
	Fields         []FormField `json:"fields"`
}

type FormFieldType string

const (
	FieldText     FormFieldType = "text"
	FieldNumber   FormFieldType = "number"
	FieldDropdown FormFieldType = "dropdown"
	FieldBoolean  FormFieldType = "boolean"
)

type FormField struct {
	Key       string        `json:"key"`
	Label     string        `json:"label"`
	Type      FormFieldType `json:"type"`
	Required  bool          `json:"required"`
	Sensitive bool          `json:"sensitive"`
	Options   []string      `json:"options,omitempty"`
}
