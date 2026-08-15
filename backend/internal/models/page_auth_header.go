package models

// PageAuthHeader stores one outbound auth header (e.g. Authorization) for a
// page's configured REST endpoint. Value is AES-256-GCM encrypted
// (nonce||ciphertext||tag) — never stored or returned in plaintext by any
// API; the API always masks it as "••••••••" and only overwrites on an
// explicit new value.
type PageAuthHeader struct {
	ID             uint   `gorm:"primaryKey"`
	PageID         uint   `gorm:"not null;uniqueIndex:idx_page_header"`
	Page           Page   `gorm:"foreignKey:PageID;constraint:OnDelete:CASCADE"`
	HeaderName     string `gorm:"not null;size:100;uniqueIndex:idx_page_header"`
	EncryptedValue []byte `gorm:"not null"`
}
