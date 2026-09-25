package core

import (
	"encoding/json"
	"testing"
)

func TestExposureOnlyTrimsAlphabeticalPositiveSet(t *testing.T) {
	input := []Tool{{ID: "z"}, {ID: "b"}, {ID: "a"}, {ID: "m"}}
	for _, cap := range []int{1, 3, 5, 8} {
		output := exposeWorkflow(input, cap)
		if len(output) != min(cap, len(input)) {
			t.Fatal("padding or wrong cap")
		}
		for i, want := range []string{"a", "b", "m", "z"}[:len(output)] {
			if output[i].ID != want {
				t.Fatal("ordering changed")
			}
		}
	}
	if len(exposeWorkflow(nil, 8)) != 0 || input[0].ID != "z" {
		t.Fatal("input mutation or padding")
	}
	indices := catalogIndices([]Tool{{ID: "a"}, {ID: "b"}, {ID: "m"}, {ID: "z"}}, input)
	if len(indices) != 4 || indices[0] != 3 || indices[3] != 2 {
		t.Fatal("trace loses retrieval order")
	}
}

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
