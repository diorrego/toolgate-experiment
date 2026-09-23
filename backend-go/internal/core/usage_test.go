package core

import "testing"

func TestUsagePreservesUnknownAndCountsEachAttempt(t *testing.T) {
	m := &selectionMetrics{Calls: 2}
	valid := []byte(`{"model":"jev-fixture","usage":{"input_tokens":123,"output_tokens":7}}`)
	m.recordUsage(valid, "jev-fixture")
	m.recordUsage(valid, "jev-fixture")
	if m.UsageCalls != 2 || m.InputTokens != 246 || m.OutputTokens != 14 {
		t.Fatal("usage not accumulated")
	}
	for _, raw := range []string{
		`{"model":"jev-fixture"}`,
		`{"model":"other","usage":{"input_tokens":123,"output_tokens":7}}`,
		`{"model":"jev-fixture","usage":{"input_tokens":-1,"output_tokens":7}}`,
		`{"model":"jev-fixture","usage":{"input_tokens":1.5,"output_tokens":7}}`,
		`{"model":"jev-fixture","usage":{"input_tokens":null,"output_tokens":7}}`,
		`{"model":"jev-fixture","usage":{"input_tokens":123,"input_tokens":124,"output_tokens":7}}`,
	} {
		m.recordUsage([]byte(raw), "jev-fixture")
	}
	if m.UsageCalls != 2 {
		t.Fatal("invalid usage counted as measured")
	}
}
