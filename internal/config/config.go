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
	for _, origin := range strings.Split(env("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"), ",") {
		if v := strings.TrimSpace(origin); v != "" {
			c.Origins = append(c.Origins, v)
		}
	}
	if c.AIMode != "openai" && c.AIMode != "fallback" {
		return c, fmt.Errorf("AI_MODE must be openai or fallback")
	}
	if c.AIMode == "openai" && strings.TrimSpace(c.OpenAIKey) == "" {
		return c, fmt.Errorf("set OPENAI_API_KEY in .env, or explicitly select AI_MODE=fallback for a local demo")
	}
	return c, nil
}
