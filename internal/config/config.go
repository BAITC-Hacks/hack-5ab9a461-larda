package config

import (
	"fmt"
	"github.com/joho/godotenv"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address, DatabaseURL, AIMode, OpenAIKey, OpenAIURL, OpenAIModel string
	AITimeout                                                       time.Duration
	SeedDemo                                                        bool
	Origins                                                         []string
}

const defaultOrigins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://127.0.0.1:4175"

// Compose provides WEB_ORIGINS independently of CORS_ORIGINS so changing the
// frontend's published port cannot leave its own origin blocked by an old .env.
// Each entry remains an exact origin; wildcard access is never enabled.
func mergeOrigins(lists ...string) []string {
	origins := []string{}
	seen := map[string]bool{}
	for _, list := range lists {
		for _, entry := range strings.Split(list, ",") {
			origin := strings.TrimSpace(entry)
			if origin != "" && origin != "*" && !seen[origin] {
				seen[origin] = true
				origins = append(origins, origin)
			}
		}
	}
	return origins
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
func Load() (Config, error) {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return Config{}, fmt.Errorf("read .env: %w", err)
	}
	c := Config{Address: env("HTTP_ADDR", ":8080"), DatabaseURL: env("DATABASE_URL", "postgres://larda:larda@localhost:5432/larda?sslmode=disable"), AIMode: env("AI_MODE", "openai"), OpenAIKey: os.Getenv("OPENAI_API_KEY"), OpenAIURL: env("OPENAI_BASE_URL", "https://api.openai.com/v1"), OpenAIModel: env("OPENAI_MODEL", "gpt-4o-mini")}
	var err error
	c.AITimeout, err = time.ParseDuration(env("AI_TIMEOUT", "60s"))
	if err != nil || c.AITimeout < time.Second || c.AITimeout > 90*time.Second {
		return c, fmt.Errorf("AI_TIMEOUT must be between 1s and 90s")
	}
	c.SeedDemo, err = strconv.ParseBool(env("SEED_DEMO", "true"))
	if err != nil {
		return c, fmt.Errorf("SEED_DEMO must be a boolean")
	}
	c.Origins = mergeOrigins(env("CORS_ORIGINS", defaultOrigins), env("WEB_ORIGINS", ""))
	if c.AIMode != "openai" && c.AIMode != "fallback" {
		return c, fmt.Errorf("AI_MODE must be openai or fallback")
	}
	if c.AIMode == "openai" && strings.TrimSpace(c.OpenAIKey) == "" {
		return c, fmt.Errorf("set OPENAI_API_KEY in .env, or explicitly select AI_MODE=fallback for a local demo")
	}
	return c, nil
}
