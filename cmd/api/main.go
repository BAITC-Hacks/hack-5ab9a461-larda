package main

import (
	"context"
	"errors"
	"hackalem/internal/adapters/ai"
	"hackalem/internal/adapters/httpapi"
	"hackalem/internal/adapters/postgres"
	"hackalem/internal/application"
	"hackalem/internal/config"
	"hackalem/internal/ports"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	// A self-contained health command keeps the runtime image small.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get("http://127.0.0.1:8080/healthz")
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return errors.New("not healthy")
		}
		return nil
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	repo, err := postgres.Open(cfg.DatabaseURL)
	if err != nil {
		return errors.New("cannot connect to PostgreSQL; verify DATABASE_URL and server availability")
	}
	defer repo.Close()
	if err = repo.Migrate(ctx); err != nil {
		return err
	}
	if cfg.SeedDemo {
		if err = repo.SeedDemo(ctx); err != nil {
			return err
		}
	}
	var model ports.AI
	if cfg.AIMode == "fallback" {
		model = ai.NewFallback()
		slog.Warn("explicit local AI fallback enabled")
	} else {
		model, err = ai.NewOpenAI(cfg.OpenAIKey, cfg.OpenAIURL, cfg.OpenAIModel, cfg.AITimeout)
		if err != nil {
			return err
		}
	}
	service := application.New(repo, model)
	workerDone := make(chan struct{})
	go func() { defer close(workerDone); service.RunWorker(ctx, time.Second) }()
	server := http.Server{Addr: cfg.Address, Handler: httpapi.New(service, cfg.Origins), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("API listening", "address", cfg.Address, "ai_mode", cfg.AIMode)
		errCh <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
	case err = <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			stop()
			return err
		}
	}
	stop()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = server.Shutdown(shutdown)
	select {
	case <-workerDone:
	case <-shutdown.Done():
	}
	return err
}
