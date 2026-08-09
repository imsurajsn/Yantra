package config

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port string

	// Database
	DBType     string // postgres | mysql | mariadb
	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string
	DBSSLMode  string

	// Security
	AppSecret  string // Used to sign JWTs and derive AES key
	BcryptCost int

	// Session
	SessionDurationHours int
}

var C Config

func Load() {
	// Load .env if present (ignored in Docker where env vars are injected)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, reading from environment")
	}

	C = Config{
		Port:                 getEnv("PORT", "8080"),
		DBType:               getEnv("DB_TYPE", "postgres"),
		DBHost:               getEnv("DB_HOST", "localhost"),
		DBPort:               getEnv("DB_PORT", "5432"),
		DBName:               getEnv("DB_NAME", "yantra"),
		DBUser:               getEnv("DB_USER", "yantra"),
		DBPassword:           getEnv("DB_PASSWORD", "yantra"),
		DBSSLMode:            getEnv("DB_SSL_MODE", "disable"),
		AppSecret:            getEnv("APP_SECRET", ""),
		BcryptCost:           getEnvInt("BCRYPT_COST", 12),
		SessionDurationHours: getEnvInt("SESSION_DURATION_HOURS", 8),
	}

	if C.AppSecret == "" {
		log.Fatal("FATAL: APP_SECRET environment variable must be set. The application will not start without it.")
	}
}

func (c *Config) DSN() string {
	switch c.DBType {
	case "postgres":
		return fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
			c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
		)
	case "mysql", "mariadb":
		return fmt.Sprintf(
			"%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=UTC",
			c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName,
		)
	default:
		log.Fatalf("Unsupported DB_TYPE: %s. Supported: postgres, mysql, mariadb", c.DBType)
		return ""
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			log.Printf("Invalid integer for %s: %s, using default %d", key, v, fallback)
			return fallback
		}
		return n
	}
	return fallback
}
