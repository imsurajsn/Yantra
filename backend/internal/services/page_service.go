package services

import (
	"errors"

	appcrypto "github.com/imsurajsn/yantra/internal/crypto"
	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"gorm.io/gorm"
)

var ErrPageValidation = errors.New("page: config failed validation")

// AuthHeaderInput is the plaintext shape the admin UI submits — the API
// never returns plaintext values back, only masked names (see MaskedNames).
type AuthHeaderInput struct {
	Name  string
	Value string
}

type PageService struct {
	pages *repositories.PageRepository
	aead  *appcrypto.AESGCM
}

func NewPageService(pages *repositories.PageRepository, aead *appcrypto.AESGCM) *PageService {
	return &PageService{pages: pages, aead: aead}
}

// Create validates the YAML, then writes the page + its encrypted auth
// headers in one transaction. Returns (nil, validationErrors, ErrPageValidation)
// if the YAML doesn't pass — callers must check for that before treating a
// nil page as a real failure.
func (s *PageService) Create(pageType models.PageType, yamlText string, groupID, creatorID uint, authHeaders []AuthHeaderInput) (*models.Page, []string, error) {
	parsed, errs := ValidatePageYAML(pageType, yamlText)
	if errs != nil {
		return nil, errs, ErrPageValidation
	}

	page := &models.Page{
		Name:        parsed.Title,
		Description: parsed.Description,
		PageType:    pageType,
		PageGroupID: groupID,
		Config:      parsed.Config,
		CreatedByID: creatorID,
	}

	encrypted, err := s.encryptHeaders(page.ID, authHeaders)
	if err != nil {
		return nil, nil, err
	}

	err = s.pages.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(page).Error; err != nil {
			return err
		}
		for i := range encrypted {
			encrypted[i].PageID = page.ID
		}
		return s.pages.ReplaceAuthHeaders(tx, page.ID, encrypted)
	})
	if err != nil {
		return nil, nil, err
	}
	return page, nil, nil
}

// Update re-validates the YAML and replaces the page's config + auth
// headers. Like Create, a validation failure returns (nil, errs, ErrPageValidation).
func (s *PageService) Update(id uint, groupID uint, yamlText string, authHeaders []AuthHeaderInput) (*models.Page, []string, error) {
	page, err := s.pages.FindByID(id)
	if err != nil {
		return nil, nil, err
	}

	parsed, errs := ValidatePageYAML(page.PageType, yamlText)
	if errs != nil {
		return nil, errs, ErrPageValidation
	}

	page.Name = parsed.Title
	page.Description = parsed.Description
	page.PageGroupID = groupID
	page.Config = parsed.Config

	encrypted, err := s.encryptHeaders(page.ID, authHeaders)
	if err != nil {
		return nil, nil, err
	}

	err = s.pages.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(page).Error; err != nil {
			return err
		}
		return s.pages.ReplaceAuthHeaders(tx, page.ID, encrypted)
	})
	if err != nil {
		return nil, nil, err
	}
	return page, nil, nil
}

func (s *PageService) encryptHeaders(pageID uint, inputs []AuthHeaderInput) ([]models.PageAuthHeader, error) {
	out := make([]models.PageAuthHeader, 0, len(inputs))
	for _, h := range inputs {
		blob, err := s.aead.Encrypt(h.Value)
		if err != nil {
			return nil, err
		}
		out = append(out, models.PageAuthHeader{PageID: pageID, HeaderName: h.Name, EncryptedValue: blob})
	}
	return out, nil
}

func (s *PageService) Get(id uint) (*models.Page, error) {
	return s.pages.FindByID(id)
}

func (s *PageService) List() ([]models.Page, error) {
	return s.pages.List()
}

func (s *PageService) Delete(id uint) error {
	return s.pages.Delete(id)
}

// MaskedAuthHeaderNames returns just the header names for a page — never
// values. The admin UI shows these as "Authorization: ••••••••" and only
// overwrites a value if the admin types a new one.
func (s *PageService) MaskedAuthHeaderNames(pageID uint) ([]string, error) {
	headers, err := s.pages.AuthHeaders(pageID)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(headers))
	for _, h := range headers {
		names = append(names, h.HeaderName)
	}
	return names, nil
}

// SensitiveFieldKeys re-exposes the package-level helper as a method so
// handlers that already hold a *PageService don't need a second import.
func (s *PageService) SensitiveFieldKeys(config []byte) (map[string]bool, error) {
	return SensitiveFieldKeys(config)
}

// DecryptedAuthHeaders is used only by the runtime proxy (internal, never
// exposed via any API response) to build the outbound request to the
// page's configured external endpoint.
func (s *PageService) DecryptedAuthHeaders(pageID uint) (map[string]string, error) {
	headers, err := s.pages.AuthHeaders(pageID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(headers))
	for _, h := range headers {
		plaintext, err := s.aead.Decrypt(h.EncryptedValue)
		if err != nil {
			return nil, err
		}
		out[h.HeaderName] = plaintext
	}
	return out, nil
}
