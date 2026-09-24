package core

import (
	"encoding/json"
	"os"
	"testing"
)

func TestWokuPatternParity(t *testing.T) {
	raw, err := os.ReadFile("../../../shared/fixtures/woku-patterns.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Pattern, Value string
		Valid          bool
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		schema := map[string]any{"type": "object", "properties": map[string]any{"value": map[string]any{"type": "string", "pattern": c.Pattern}}}
		issues, _, err := ValidateArguments(schema, map[string]any{"value": c.Value})
		if err != nil {
			t.Fatalf("pattern %q: %v", c.Pattern, err)
		}
		if (len(issues) == 0) != c.Valid {
			t.Errorf("pattern %q value %q", c.Pattern, c.Value)
		}
	}
}

func TestDraft7RefValidationSiblingsRejected(t *testing.T) {
	schema := map[string]any{"$schema": "http://json-schema.org/draft-07/schema#", "type": "object", "$defs": map[string]any{"s": map[string]any{"type": "string"}}, "properties": map[string]any{"s": map[string]any{"$ref": "#/$defs/s", "minLength": 3}}}
	if _, _, err := ValidateArguments(schema, map[string]any{"s": "x"}); err == nil {
		t.Fatal("draft-07 ref validation siblings accepted")
	}
}
