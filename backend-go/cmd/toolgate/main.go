// Command toolgate runs the local bootstrap health server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"toolgate.local/backend-go/internal/config"
	"toolgate.local/backend-go/internal/core"
	"toolgate.local/backend-go/internal/httpapi"
)

func main() {
	if err := run(); err != nil {
		// Do not log arbitrary configuration values or error chains.
		slog.Error("bootstrap failed")
		os.Exit(1)
	}
}

func run() error {
	addr, err := config.ListenAddress(os.Getenv("TOOLGATE_LISTEN_ADDR"))
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var handler http.Handler = httpapi.Handler()
	if database := os.Getenv("TOOLGATE_DATABASE_URL"); database != "" {
		model := os.Getenv("TOOLGATE_JEV_MODEL")
		if model == "" {
			model = "jev-1.13.0"
		}
		connectMS := int64(300)
		if raw := os.Getenv("TOOLGATE_CONNECT_TIMEOUT_MS"); raw != "" {
			parsed, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || parsed < 1 || parsed > 2200 {
				return errors.New("invalid connect timeout")
			}
			connectMS = parsed
		}
		app, err := core.New(ctx, database, os.Getenv("TOOLGATE_KEY_PEPPER"), os.Getenv("TOOLGATE_JEV_BASE_URL"), os.Getenv("TYPESAFE_AI_API_KEY"), model, time.Duration(connectMS)*time.Millisecond, os.Getenv("TOOLGATE_SELECTOR_MODE"))
		if err != nil {
			return err
		}
		defer app.Close()
		handler = app.Handler()
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       3 * time.Second,
		WriteTimeout:      4 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    16 * 1024,
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	slog.Info("bootstrap listening", "address", addr, "readiness", "not_ready")
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		shutdownErr := server.Shutdown(shutdownCtx)
		if shutdownErr != nil {
			if err := server.Close(); err != nil {
				return errors.Join(shutdownErr, err)
			}
		}
		serveErr := <-done
		if !errors.Is(serveErr, http.ErrServerClosed) {
			return errors.Join(shutdownErr, serveErr)
		}
		return shutdownErr
	}
}
