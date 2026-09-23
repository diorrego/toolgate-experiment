package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	for _, tc := range []struct {
		name, method, path string
		status             int
		body               string
	}{
		{"live without credentials or dependencies", "GET", "/health/live", 200, `{"status":"ok"}`},
		{"not ready before persistence and catalog bootstrap", "GET", "/health/ready", 503, `{"status":"not_ready"}`},
		{"post cannot use liveness", "POST", "/health/live", 405, ""},
		{"exact path only", "GET", "/health/live/extra", 404, ""},
		{"head returns no body", "HEAD", "/health/live", 200, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			Handler().ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
			if response.Code != tc.status {
				t.Fatalf("status = %d; want %d", response.Code, tc.status)
			}
			if tc.body != "" && response.Body.String() != tc.body {
				t.Fatalf("body = %q; want %q", response.Body.String(), tc.body)
			}
			if tc.method == "HEAD" && response.Body.Len() != 0 {
				t.Fatal("HEAD returned a body")
			}
			if tc.body != "" && response.Header().Get("Content-Type") != "application/json" {
				t.Fatal("missing JSON content type")
			}
			if tc.body != "" && response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("health must not be cached")
			}
		})
	}
}

func TestLiveOverNetwork(t *testing.T) {
	server := httptest.NewServer(Handler())
	defer server.Close()
	response, err := server.Client().Get(server.URL + "/health/live")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", response.StatusCode)
	}
}
