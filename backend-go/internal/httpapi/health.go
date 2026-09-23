// Package httpapi exposes the bootstrap health surface.
package httpapi

import "net/http"

// Handler creates an independent router. Readiness stays unavailable until
// storage and catalog bootstrap are implemented; liveness has no dependencies.
func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", health(http.StatusOK, `{"status":"ok"}`))
	mux.HandleFunc("GET /health/ready", health(http.StatusServiceUnavailable, `{"status":"not_ready"}`))
	return mux
}

func health(status int, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		if r.Method != http.MethodHead {
			// A disconnected health probe needs no retry or log of request data.
			if _, err := w.Write([]byte(body)); err != nil {
				return
			}
		}
	}
}
