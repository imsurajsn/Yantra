package services

import (
	"encoding/json"
	"time"

	"github.com/imsurajsn/yantra/internal/models"
	"github.com/imsurajsn/yantra/internal/repositories"
	"gorm.io/datatypes"
)

// AuditService is the ONLY place that constructs and writes AuditLog rows.
// Redaction of `sensitive: true` form fields happens here, before Create()
// is ever called — an unredacted value must never exist in a variable that
// could reach the repository, not just be filtered at query time.
type AuditService struct {
	repo *repositories.AuditRepository
}

func NewAuditService(repo *repositories.AuditRepository) *AuditService {
	return &AuditService{repo: repo}
}

const redacted = "[REDACTED]"

// RecordLogin/RecordLoginFailed/RecordLogout cover PRD requirement 26:
// every login and logout event recorded with user email, timestamp, IP,
// user agent.
func (s *AuditService) RecordLogin(actorEmail string, actorUserID *uint, ip, userAgent string) error {
	return s.write(models.EventLogin, actorUserID, actorEmail, nil, nil, ip, userAgent, nil, nil, nil)
}

func (s *AuditService) RecordLoginFailed(attemptedEmail, ip, userAgent string) error {
	return s.write(models.EventLoginFailed, nil, attemptedEmail, nil, nil, ip, userAgent, nil, nil, nil)
}

func (s *AuditService) RecordLogout(actorEmail string, actorUserID uint, ip, userAgent string) error {
	return s.write(models.EventLogout, &actorUserID, actorEmail, nil, nil, ip, userAgent, nil, nil, nil)
}

// RecordPageView covers PRD requirement 27.
func (s *AuditService) RecordPageView(actorEmail string, actorUserID uint, pageID uint, pageTitle string) error {
	return s.write(models.EventPageView, &actorUserID, actorEmail, &pageID, &pageTitle, "", "", nil, nil, nil)
}

// RedactSensitiveFields replaces every value whose key is in sensitiveKeys
// with "[REDACTED]", returning a new map — the caller must use the
// returned map (not the original) as the value passed to RecordFormSubmit,
// per PRD requirement 28.
func RedactSensitiveFields(values map[string]interface{}, sensitiveKeys map[string]bool) map[string]interface{} {
	out := make(map[string]interface{}, len(values))
	for k, v := range values {
		if sensitiveKeys[k] {
			out[k] = redacted
		} else {
			out[k] = v
		}
	}
	return out
}

// RecordFormSubmit covers PRD requirement 28. fieldValues must already be
// redacted (see RedactSensitiveFields) before this is called.
func (s *AuditService) RecordFormSubmit(actorEmail string, actorUserID uint, pageID uint, pageTitle string, redactedFieldValues map[string]interface{}) error {
	data, err := json.Marshal(map[string]interface{}{"field_values": redactedFieldValues})
	if err != nil {
		return err
	}
	return s.write(models.EventFormSubmit, &actorUserID, actorEmail, &pageID, &pageTitle, "", "", nil, nil, data)
}

// RecordAPICall covers PRD requirement 29: endpoint, method, timestamp,
// response status for any REST call a page action triggers (data fetch,
// writeback save).
func (s *AuditService) RecordAPICall(actorEmail string, actorUserID uint, pageID uint, pageTitle, method, endpoint string, statusCode int) error {
	data, err := json.Marshal(map[string]interface{}{"endpoint": endpoint})
	if err != nil {
		return err
	}
	return s.write(models.EventAPICall, &actorUserID, actorEmail, &pageID, &pageTitle, "", "", &method, &statusCode, data)
}

func (s *AuditService) write(
	eventType models.AuditEventType,
	actorUserID *uint,
	actorEmail string,
	pageID *uint,
	pageTitleSnapshot *string,
	ip, userAgent string,
	httpMethod *string,
	httpStatusCode *int,
	eventData datatypes.JSON,
) error {
	entry := &models.AuditLog{
		EventType:         eventType,
		ActorUserID:       actorUserID,
		ActorEmail:        actorEmail,
		PageID:            pageID,
		PageTitleSnapshot: pageTitleSnapshot,
		IPAddress:         ip,
		UserAgent:         userAgent,
		HTTPMethod:        httpMethod,
		HTTPStatusCode:    httpStatusCode,
		EventData:         eventData,
		CreatedAt:         time.Now(),
	}
	return s.repo.Create(entry)
}
