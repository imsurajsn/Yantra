// Package config loads and validates all environment-driven configuration.
// Nothing outside this package should call os.Getenv directly — every knob
// the app reads is declared and validated once, here, at boot.
package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

type DBType string

const (
	DBPostgres DBType = "postgres"
	DBMySQL    DBType = "mysql"
	DBMariaDB  DBType = "mariadb" // uses the MySQL driver — fully wire-compatible
)

type Config struct {
	Port    string
	DBType  DBType
	DBDSN   string
	// AppSecret backs both JWT signing and the AES-256-GCM key (via HKDF).
	// The app refuses to start without it — see Load().
	AppSecret string
	// TrustedProxies is env/config-only, never DB-editable (see models.Setting
	// doc) — a compromised Admin account must not be able to widen its own
	// audit-log IP trust boundary.
	TrustedProxies         []string
	SessionInactivityMins  int
}

// Load reads and validates all config from the environment. It calls
// log.Fatal (not error return) for conditions the PRD says must hard-stop
// boot — an unset/too-short APP_SECRET, or an unrecognized DB_TYPE —
// because there is no safe partially-started state for this app.
func Load() *Config {
	appSecret := os.Getenv("APP_SECRET")
	if len(appSecret) < 32 {
		log.Fatal("APP_SECRET is not set (or is shorter than 32 characters). " +
			"Generate one with `make generate-secret` or `openssl rand -base64 32`, " +
			"then set it in your .env file. Yantra will not start without it — " +
			"it derives both the JWT signing key and the AES-256-GCM key that " +
			"protects page auth-header secrets at rest.")
	}

	dbType := DBType(getEnvDefault("DB_TYPE", string(DBPostgres)))
	if dbType != DBPostgres && dbType != DBMySQL && dbType != DBMariaDB {
		log.Fatalf("DB_TYPE=%q is not supported. Use one of: postgres, mysql, mariadb", dbType)
	}

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatal("DB_DSN is not set. See .env.example for the expected format per DB_TYPE.")
	}

	sessionMins, err := strconv.Atoi(getEnvDefault("SESSION_INACTIVITY_MINUTES", "480"))
	if err != nil || sessionMins <= 0 {
		log.Fatal("SESSION_INACTIVITY_MINUTES must be a positive integer")
	}

	var trustedProxies []string
	if raw := os.Getenv("TRUSTED_PROXIES"); raw != "" {
		for _, p := range strings.Split(raw, ",") {
			if p = strings.TrimSpace(p); p != "" {
				trustedProxies = append(trustedProxies, p)
			}
		}
	}

	return &Config{
		Port:                  getEnvDefault("PORT", "8080"),
		DBType:                dbType,
		DBDSN:                 dsn,
		AppSecret:             appSecret,
		TrustedProxies:        trustedProxies,
		SessionInactivityMins: sessionMins,
	}
}

func getEnvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// SessionDuration is a convenience formatted for logs/errors.
func (c *Config) String() string {
	return fmt.Sprintf("db_type=%s port=%s session_inactivity_minutes=%d trusted_proxies=%v",
		c.DBType, c.Port, c.SessionInactivityMins, c.TrustedProxies)
}
