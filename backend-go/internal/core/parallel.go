package core

import (
	"context"
	"sort"
	"sync/atomic"
	"time"
)

type binaryActivityKey struct{}
type binaryActivity struct {
	active atomic.Int32
	peak   atomic.Int32
}

func (a *binaryActivity) enter() {
	n := a.active.Add(1)
	for {
		old := a.peak.Load()
		if old >= n || a.peak.CompareAndSwap(old, n) {
			break
		}
	}
}
func (a *binaryActivity) leave() { a.active.Add(-1) }

// A bounded pool owns all work. It joins cancelled requests before returning;
// partial successful responses never authorize selection.
func (s *Selector) selectBinary(ctx context.Context, candidates []Tool, request Request) (*Tool, []Candidate, string, error) {
	if len(candidates) > 64 {
		return nil, nil, "", fail(400, "INVALID_REQUEST")
	}
	ctx, cancel := context.WithTimeout(ctx, 2200*time.Millisecond)
	defer cancel()
	activity := &binaryActivity{}
	ctx = context.WithValue(ctx, binaryActivityKey{}, activity)
	type result struct {
		index   int
		answer  ChoiceResult
		metrics selectionMetrics
		err     error
	}
	jobs := make(chan int, len(candidates))
	results := make(chan result, len(candidates))
	for i := range candidates {
		jobs <- i
	}
	close(jobs)
	workers := min(22, len(candidates))
	for range workers {
		go func() {
			for i := range jobs {
				item := result{index: i}
				if ctx.Err() != nil {
					item.err = ctx.Err()
				} else {
					item.answer, item.err = s.choose(context.WithValue(ctx, metricsContextKey{}, &item.metrics), candidates[i:i+1], request.Intent, request.Context)
				}
				results <- item
			}
		}()
	}
	answers := make([]ChoiceResult, len(candidates))
	errors := make([]error, len(candidates))
	for range candidates {
		item := <-results
		answers[item.index] = item.answer
		errors[item.index] = item.err
		if total, ok := ctx.Value(metricsContextKey{}).(*selectionMetrics); ok {
			total.Calls += item.metrics.Calls
			total.Duration += item.metrics.Duration
			total.UsageCalls += item.metrics.UsageCalls
			total.InputTokens += item.metrics.InputTokens
			total.OutputTokens += item.metrics.OutputTokens
		}
	}
	if total, ok := ctx.Value(metricsContextKey{}).(*selectionMetrics); ok {
		total.MaxConcurrent = int(activity.peak.Load())
	}
	for _, err := range errors {
		if err != nil {
			return nil, nil, "", err
		}
	}
	return reduceBinary(candidates, answers)
}

func reduceBinary(tools []Tool, answers []ChoiceResult) (*Tool, []Candidate, string, error) {
	if len(tools) != len(answers) {
		return nil, nil, "", fail(502, "SELECTOR_INVALID_RESPONSE")
	}
	type scored struct {
		tool                  Tool
		probability, negative float64
	}
	positives := []scored{}
	for i, a := range answers {
		if a.Choice == "t0001" {
			positives = append(positives, scored{tools[i], a.Probabilities["t0001"], a.Probabilities["none"]})
		}
	}
	sort.Slice(positives, func(i, j int) bool {
		if positives[i].probability == positives[j].probability {
			return positives[i].tool.ID < positives[j].tool.ID
		}
		return positives[i].probability > positives[j].probability
	})
	if len(positives) == 0 {
		return nil, nil, "selector_abstained", nil
	}
	top := positives[0]
	threshold, margin := .70, .15
	if top.tool.Effect != "read" {
		threshold, margin = .85, .25
	}
	second := top.negative
	if len(positives) > 1 {
		second = max(second, positives[1].probability)
	}
	if top.probability >= threshold && top.probability-second >= margin {
		return &top.tool, nil, "", nil
	}
	if len(positives) < 2 {
		return nil, nil, "selector_abstained", nil
	}
	choices := []Candidate{}
	for _, p := range positives[:min(5, len(positives))] {
		t := p.tool
		choices = append(choices, Candidate{t.ID, t.Title, short(t.Description), t.Effect})
	}
	return nil, choices, "low_confidence", nil
}
