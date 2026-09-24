package core

import (
	"encoding/json"
	"testing"
)

func TestWorkflowDecodeCompleteAndBounded(t *testing.T) {
	answer := map[string]any{"type": "choice", "choice": "yes", "confidence": 0.9, "probabilities": map[string]float64{"yes": 0.9, "no": 0.1}}
	raw, _ := json.Marshal(map[string]any{"model": "test", "answers": map[string]any{"q0001": answer, "q0002": answer}})
	tools := []Tool{{ID: "read", Effect: "read"}, {ID: "write", Effect: "write"}}
	got, err := decodeWorkflow(raw, tools, "test")
	if err != nil || len(got) != 2 {
		t.Fatalf("complete set: %v %v", got, err)
	}
	if _, err = decodeWorkflow(raw, tools[:1], "test"); err == nil {
		t.Fatal("extra answer accepted")
	}
	if _, err = decodeWorkflow(raw, tools, "other"); err == nil {
		t.Fatal("wrong model accepted")
	}
	raw, _ = json.Marshal(map[string]any{"model": "test", "answers": map[string]any{"q0001": answer}})
	if _, err = decodeWorkflow(raw, tools, "test"); err == nil {
		t.Fatal("missing answer accepted")
	}
}
