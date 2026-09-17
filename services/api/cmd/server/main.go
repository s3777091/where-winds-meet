package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/local/wwm-companion/services/api/internal/analysis"
	"github.com/local/wwm-companion/services/api/internal/domain"
	"github.com/local/wwm-companion/services/api/internal/httpapi"
	"github.com/local/wwm-companion/services/api/internal/store"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	ctx := context.Background()
	settings := domain.Settings{
		Language:  env("WWM_LANGUAGE", "vi"),
		AIModel:   firstEnvWithFallback("google/gemma-4-26b-a4b-it:free", "OPENROUTER_MODEL", "QWEN_MODEL"),
		GamePatch: env("WWM_GAME_PATCH", "official-live"),
		KBVersion: env("WWM_KB_VERSION", "official-map-v1"),
	}

	var repository store.Store
	var err error
	if databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); databaseURL != "" {
		repository, err = store.NewPostgresStore(ctx, databaseURL)
	} else if strings.EqualFold(env("WWM_DATA_SOURCE", "official"), "fixture") {
		repository, err = store.NewFileStore(
			env("WWM_STATE_FILE", "data/local/player-state.json"),
			env("WWM_SEED_FILE", "data/seed/dev-pois.json"),
			settings,
		)
	} else {
		repository, err = store.NewOfficialFileStore(
			ctx,
			env("WWM_STATE_FILE", "data/local/player-state.json"),
			env("WWM_OFFICIAL_CACHE_FILE", "data/local/official-map-cache.json"),
			env("WWM_GUIDE_FILE", "data/guides/verified-poi-guides.json"),
			settings,
		)
	}
	if err != nil {
		logger.Error("initialize store", "error", err)
		os.Exit(1)
	}
	defer repository.Close()

	analyzer := analysis.New(analysis.Config{
		Enabled:        strings.EqualFold(firstEnvWithFallback("false", "AI_ANALYSIS_ENABLED", "QWEN_ANALYSIS_ENABLED"), "true"),
		APIKey:         firstEnv("OPENROUTER_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY"),
		BaseURL:        firstEnvWithFallback("https://openrouter.ai/api/v1", "OPENROUTER_BASE_URL", "QWEN_BASE_URL"),
		Model:          settings.AIModel,
		FallbackModels: splitList(env("OPENROUTER_FALLBACK_MODELS", "qwen/qwen3.7-flash")),
		Provider:       env("AI_PROVIDER", "openrouter"),
		GamePatch:      settings.GamePatch,
		KBVersion:      settings.KBVersion,
	}, repository)

	api := httpapi.New(httpapi.Config{WebOrigin: env("WWM_WEB_ORIGIN", "http://localhost:3199")}, repository, analyzer, logger)
	server := &http.Server{
		Addr:              env("WWM_API_ADDR", "127.0.0.1:3200"),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       70 * time.Second,
		WriteTimeout:      70 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info("WWM local API ready", "address", server.Addr, "storage", repository.Name(), "ai_mode", analyzer.Mode())
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("serve API", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownContext, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := httpapi.Shutdown(shutdownContext, server); err != nil {
		logger.Error("shutdown API", "error", err)
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func firstEnvWithFallback(fallback string, keys ...string) string {
	if value := firstEnv(keys...); value != "" {
		return value
	}
	return fallback
}

func splitList(value string) []string {
	var result []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
