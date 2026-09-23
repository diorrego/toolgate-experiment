package core

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestBinaryParallelHTTP(t *testing.T) {
	var arrived atomic.Int32
	var invalid atomic.Bool
	gate := make(chan struct{})
	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Questions map[string]struct {
				Criteria map[string]string `json:"criteria"`
			} `json:"questions"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || len(body.Questions["selection"].Criteria) != 2 {
			invalid.Store(true)
		}
		if arrived.Add(1) == 22 {
			once.Do(func() { close(gate) })
		}
		select {
		case <-gate:
		case <-r.Context().Done():
			return
		}
		p := 0.1
		if body.Questions["selection"].Criteria["t0001"] == "winner |  | effect=read |  " {
			p = 0.95
		}
		chosen := "none"
		if p > 0.5 {
			chosen = "t0001"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"model": "jev-fixture", "usage": map[string]int{"input_tokens": 10, "output_tokens": 2}, "answers": map[string]any{"selection": map[string]any{"type": "choice", "choice": chosen, "confidence": 1, "probabilities": map[string]float64{"t0001": p, "none": 1 - p}}}})
	}))
	defer server.Close()
	selector, err := newSelector(server.URL, "synthetic", "jev-fixture", time.Second, "binary-parallel-v1")
	if err != nil {
		t.Fatal(err)
	}
	defer selector.client.CloseIdleConnections()
	candidates := make([]Tool, 22)
	for i := range candidates {
		candidates[i] = Tool{ID: fmt.Sprintf("tool%02d", i), Title: "other", Effect: "read"}
	}
	candidates[7].Title = "winner"
	metrics := &selectionMetrics{}
	ctx, cancel := context.WithTimeout(context.WithValue(context.Background(), metricsContextKey{}, metrics), 4*time.Second)
	defer cancel()
	selected, choices, _, err := selector.selectTools(ctx, candidates, Request{Intent: "Read the desired value"})
	if err != nil {
		t.Fatal(err)
	}
	if invalid.Load() || arrived.Load() != 22 || selected == nil || selected.ID != "tool07" || len(choices) != 0 {
		t.Fatalf("wrong parallel result: arrivals=%d invalid=%v selected=%v", arrived.Load(), invalid.Load(), selected)
	}
	if metrics.Calls != 22 || metrics.UsageCalls != 22 || metrics.InputTokens != 220 || metrics.OutputTokens != 44 || metrics.MaxConcurrent != 22 {
		t.Fatalf("incomplete metrics: %+v", metrics)
	}
	if metrics.SelectorDuration <= 0 || metrics.Duration < metrics.SelectorDuration {
		t.Fatal("overlapping attempt time and selector wall time must be separate")
	}
}

func TestBinaryReduction(t *testing.T) {
	tools := []Tool{{ID: "a", Effect: "read"}, {ID: "b", Effect: "read"}, {ID: "c", Effect: "read"}}
	answer := func(p float64) ChoiceResult {
		c := "none"
		if p >= .5 {
			c = "t0001"
		}
		return ChoiceResult{Choice: c, Probabilities: map[string]float64{"t0001": p, "none": 1 - p}}
	}
	for _, tc := range []struct {
		name     string
		scores   []float64
		selected string
		choices  int
	}{
		{"one positive", []float64{.95, .1, .2}, "a", 0},
		{"clear winner", []float64{.95, .7, .1}, "a", 0},
		{"tie", []float64{.95, .95, .1}, "", 2},
		{"all negative", []float64{.1, .2, .3}, "", 0},
		{"one uncertain", []float64{.6, .1, .2}, "", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			answers := make([]ChoiceResult, len(tc.scores))
			for i, p := range tc.scores {
				answers[i] = answer(p)
			}
			selected, choices, _, err := reduceBinary(tools, answers)
			if err != nil {
				t.Fatal(err)
			}
			id := ""
			if selected != nil {
				id = selected.ID
			}
			if id != tc.selected || len(choices) != tc.choices {
				t.Fatalf("got %s, %d choices", id, len(choices))
			}
			if len(choices) > 0 && choices[0].ID != "a" {
				t.Fatal("ties must follow tool ID, not completion order")
			}
		})
	}
}

func TestBinaryCancellationJoinsAttempts(t *testing.T) {
	var arrived atomic.Int32
	gate := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			return
		}
		if arrived.Add(1) == 22 {
			close(gate)
		}
		<-r.Context().Done()
	}))
	defer server.Close()
	selector, err := newSelector(server.URL, "synthetic", "jev-fixture", time.Second, "binary-parallel-v1")
	if err != nil {
		t.Fatal(err)
	}
	defer selector.client.CloseIdleConnections()
	tools := make([]Tool, 22)
	for i := range tools {
		tools[i] = Tool{ID: fmt.Sprintf("tool%02d", i), Title: "read", Effect: "read"}
	}
	metrics := &selectionMetrics{}
	ctx, cancel := context.WithCancel(context.WithValue(context.Background(), metricsContextKey{}, metrics))
	defer cancel()
	done := make(chan error, 1)
	go func() {
		selected, _, _, err := selector.selectTools(ctx, tools, Request{Intent: "read"})
		if selected != nil {
			done <- fmt.Errorf("selected after cancellation")
			return
		}
		done <- err
	}()
	select {
	case <-gate:
	case <-time.After(3 * time.Second):
		t.Fatal("parallel requests did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancellation must fail")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancelled workers were not joined")
	}
	if metrics.Calls != 22 || metrics.UsageCalls != 0 || metrics.MaxConcurrent != 22 {
		t.Fatalf("cancellation lost metrics: %+v", metrics)
	}
}
