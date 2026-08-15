package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/imsurajsn/yantra/internal/models"
	"gorm.io/datatypes"
	"gopkg.in/yaml.v3"
)

// pageYAMLDoc is the shape the admin's YAML editor produces. Deliberately
// does NOT include auth headers — those are a separate "Auth Headers" form
// in the UI, encrypted server-side into PageAuthHeader, so ciphertext never
// round-trips through this plaintext-looking document (see Page's doc
// comment). This is one intentional deviation from the mockup, which
// embedded authHeaders directly in the YAML.
type pageYAMLDoc struct {
	Title          string                `yaml:"title"`
	Description    string                `yaml:"description"`
	Method         string                `yaml:"method"`
	Endpoint       string                `yaml:"endpoint"`
	PageSize       int                   `yaml:"page_size"`
	Columns        []models.TableColumn  `yaml:"columns"`
	Writeback      *models.TableWriteback `yaml:"writeback"`
	Fields         []models.FormField    `yaml:"fields"`
	SuccessMessage string                `yaml:"success_message"`
}

// ParsedPage is what a successful validation produces: everything needed to
// both preview the page and, on save, populate a Page row.
type ParsedPage struct {
	Title       string
	Description string
	Config      datatypes.JSON
	// Typed view of Config, for the preview endpoint to render without
	// re-parsing the JSON it just built.
	TableConfig *models.TableConfig
	FormConfig  *models.FormConfig
}

var validFieldTypes = map[models.FormFieldType]bool{
	models.FieldText: true, models.FieldNumber: true, models.FieldDropdown: true, models.FieldBoolean: true,
}

// ValidatePageYAML parses and validates a page's YAML config text. Returns
// (nil, errs) with a human-readable error per problem if invalid — the
// admin UI's "Validate & preview" step surfaces these directly.
func ValidatePageYAML(pageType models.PageType, yamlText string) (*ParsedPage, []string) {
	var doc pageYAMLDoc
	if err := yaml.Unmarshal([]byte(yamlText), &doc); err != nil {
		return nil, []string{"Invalid YAML: " + err.Error()}
	}

	var errs []string
	if strings.TrimSpace(doc.Title) == "" {
		errs = append(errs, "title is required")
	}
	if strings.TrimSpace(doc.Method) == "" {
		errs = append(errs, "method is required")
	}
	if strings.TrimSpace(doc.Endpoint) == "" {
		errs = append(errs, "endpoint is required")
	}

	switch pageType {
	case models.PageTypeTable:
		errs = append(errs, validateTableColumns(doc)...)
	case models.PageTypeForm:
		errs = append(errs, validateFormFields(doc)...)
	default:
		errs = append(errs, fmt.Sprintf("unknown page type %q", pageType))
	}
	if len(errs) > 0 {
		return nil, errs
	}

	method := strings.ToUpper(strings.TrimSpace(doc.Method))
	result := &ParsedPage{Title: doc.Title, Description: doc.Description}

	switch pageType {
	case models.PageTypeTable:
		pageSize := doc.PageSize
		if pageSize <= 0 {
			pageSize = 50
		}
		wb := models.TableWriteback{}
		if doc.Writeback != nil {
			wb = *doc.Writeback
		}
		cfg := models.TableConfig{
			Source:     models.PageSource{Endpoint: doc.Endpoint, Method: method},
			Pagination: models.TablePagination{PageSize: pageSize},
			Columns:    doc.Columns,
			Writeback:  wb,
		}
		result.TableConfig = &cfg
		b, err := json.Marshal(cfg)
		if err != nil {
			return nil, []string{"internal error encoding config"}
		}
		result.Config = datatypes.JSON(b)
	case models.PageTypeForm:
		cfg := models.FormConfig{
			Source:         models.PageSource{Endpoint: doc.Endpoint, Method: method},
			SuccessMessage: doc.SuccessMessage,
			Fields:         doc.Fields,
		}
		result.FormConfig = &cfg
		b, err := json.Marshal(cfg)
		if err != nil {
			return nil, []string{"internal error encoding config"}
		}
		result.Config = datatypes.JSON(b)
	}
	return result, nil
}

func validateTableColumns(doc pageYAMLDoc) []string {
	var errs []string
	if len(doc.Columns) == 0 {
		errs = append(errs, "columns must have at least one entry")
	}
	for i, c := range doc.Columns {
		if c.Key == "" {
			errs = append(errs, fmt.Sprintf("columns[%d] is missing \"key\"", i))
		}
		if c.Label == "" {
			errs = append(errs, fmt.Sprintf("columns[%d] is missing \"label\"", i))
		}
	}
	if doc.Writeback != nil && doc.Writeback.Enabled && strings.TrimSpace(doc.Writeback.Endpoint) == "" {
		errs = append(errs, "writeback.endpoint is required when writeback.enabled is true")
	}
	return errs
}

func validateFormFields(doc pageYAMLDoc) []string {
	var errs []string
	if len(doc.Fields) == 0 {
		errs = append(errs, "fields must have at least one entry")
	}
	for i, f := range doc.Fields {
		if f.Key == "" {
			errs = append(errs, fmt.Sprintf("fields[%d] is missing \"key\"", i))
		}
		if f.Label == "" {
			errs = append(errs, fmt.Sprintf("fields[%d] is missing \"label\"", i))
		}
		if !validFieldTypes[f.Type] {
			errs = append(errs, fmt.Sprintf("fields[%d].type must be text, number, dropdown or boolean", i))
		}
	}
	return errs
}

// DefaultTableYAML/DefaultFormYAML seed the admin's "New page" editor with
// a working starting point, matching the mockup's defaultTableYaml/
// defaultFormYaml.
func DefaultTableYAML() string {
	return `title: New Data Table Page
description: Describe what this page shows.
method: GET
endpoint: https://api.example.com/v1/resource
page_size: 50
columns:
  - key: id
    label: ID
    sortable: true
    editable: false
  - key: name
    label: Name
    sortable: true
    editable: false
writeback:
  enabled: false
  method: PATCH
  endpoint: https://api.example.com/v1/resource/{id}
  id_field: id
`
}

func DefaultFormYAML() string {
	return `title: New Form Page
description: Describe what this form does.
method: POST
endpoint: https://api.example.com/v1/action
fields:
  - key: field_key
    label: Field label
    type: text
    required: true
    sensitive: false
`
}

// ToYAML serializes a stored page's title/description/config back into
// editable YAML text — used when opening an existing page in "Edit config".
func ToYAML(p *models.Page) (string, error) {
	doc := pageYAMLDoc{Title: p.Name, Description: p.Description}

	switch p.PageType {
	case models.PageTypeTable:
		var cfg models.TableConfig
		if err := json.Unmarshal(p.Config, &cfg); err != nil {
			return "", err
		}
		doc.Method = cfg.Source.Method
		doc.Endpoint = cfg.Source.Endpoint
		doc.PageSize = cfg.Pagination.PageSize
		doc.Columns = cfg.Columns
		doc.Writeback = &cfg.Writeback
	case models.PageTypeForm:
		var cfg models.FormConfig
		if err := json.Unmarshal(p.Config, &cfg); err != nil {
			return "", err
		}
		doc.Method = cfg.Source.Method
		doc.Endpoint = cfg.Source.Endpoint
		doc.SuccessMessage = cfg.SuccessMessage
		doc.Fields = cfg.Fields
	}

	b, err := yaml.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// SensitiveFieldKeys extracts the set of field keys marked sensitive:true
// from a form's config JSON — used by the runtime submit handler to redact
// before writing the audit log entry (PRD requirement 28).
func SensitiveFieldKeys(config datatypes.JSON) (map[string]bool, error) {
	var cfg models.FormConfig
	if err := json.Unmarshal(config, &cfg); err != nil {
		return nil, err
	}
	keys := make(map[string]bool)
	for _, f := range cfg.Fields {
		if f.Sensitive {
			keys[f.Key] = true
		}
	}
	return keys, nil
}
