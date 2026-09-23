package config

import (
	"os"
	"reflect"
	"testing"
)

func testConfiguration(t *testing.T) {
	t.Helper()
	// Configuration tests must never read or print the developer's .env secrets.
	t.Chdir(t.TempDir())
	t.Setenv("AI_MODE", "fallback")
	t.Setenv("AI_TIMEOUT", "60s")
	t.Setenv("SEED_DEMO", "false")
}

func TestComposeWebOriginsSurviveStaleCORSOverride(t *testing.T) {
	testConfiguration(t)
	t.Setenv("CORS_ORIGINS", "http://localhost:3001,https://portal.example.test")
	t.Setenv("WEB_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"http://localhost:3001", "https://portal.example.test", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"}
	if !reflect.DeepEqual(cfg.Origins, want) {
		t.Fatalf("origins = %v, want %v", cfg.Origins, want)
	}
}

func TestOriginsRemainExactAndDeduplicated(t *testing.T) {
	testConfiguration(t)
	t.Setenv("CORS_ORIGINS", " *, https://portal.example.test , , http://localhost:4321 ")
	t.Setenv("WEB_ORIGINS", "http://localhost:4321, http://127.0.0.1:4321, *")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"https://portal.example.test", "http://localhost:4321", "http://127.0.0.1:4321"}
	if !reflect.DeepEqual(cfg.Origins, want) {
		t.Fatalf("origins = %v, want only exact configured origins %v", cfg.Origins, want)
	}
}

func TestNativeExplicitOriginListIsNotBroadened(t *testing.T) {
	testConfiguration(t)
	t.Setenv("CORS_ORIGINS", "https://portal.example.test")
	t.Setenv("WEB_ORIGINS", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cfg.Origins, []string{"https://portal.example.test"}) {
		t.Fatalf("explicit native origins were broadened: %v", cfg.Origins)
	}
}

func TestNativeDefaultsSupportLocalFrontendAddresses(t *testing.T) {
	testConfiguration(t)
	for _, key := range []string{"CORS_ORIGINS", "WEB_ORIGINS"} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatal(err)
		}
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001", "http://127.0.0.1:4175"}
	if !reflect.DeepEqual(cfg.Origins, want) {
		t.Fatalf("native default origins = %v, want %v", cfg.Origins, want)
	}
}
