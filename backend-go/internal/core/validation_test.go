package core

import (
	"strings"
	"testing"
)

func TestStrictJSON(t *testing.T) {
	for _, raw := range []string{`{"a":1,"\u0061":2}`, `{"constructor":false}`, `1e999`, `9007199254740992`, `{} {}`, strings.Repeat("[", 34) + "0" + strings.Repeat("]", 34)} {
		if _, err := ParseJSON([]byte(raw)); err == nil {
			t.Errorf("accepted invalid JSON")
		}
	}
	if _, err := ParseJSON([]byte(`{"zero":0,"flag":false,"nothing":null}`)); err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalAndValidation(t *testing.T) {
	value, err := ParseJSON([]byte(`{"z":-0,"a":1e-7}`))
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := Canonical(value)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) != `{"a":1e-7,"z":0}` {
		t.Fatalf("unexpected canonical output %s", canonical)
	}
	schema := map[string]interface{}{"type": "object", "properties": map[string]interface{}{"count": map[string]interface{}{"type": "integer"}}, "required": []interface{}{"count"}, "additionalProperties": false}
	issues, missing, err := ValidateArguments(schema, map[string]interface{}{})
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 1 || len(missing) != 1 || missing[0] != "/count" {
		t.Fatal("missing required property not reported")
	}
	issues, _, err = ValidateArguments(schema, map[string]interface{}{"count": 0.0})
	if err != nil || len(issues) != 0 {
		t.Fatal("zero must be preserved")
	}
}

func TestSelectionDistribution(t *testing.T) {
	for _, raw := range []string{
		`{"model":"jev-test","answers":{"selection":{"type":"choice","choice":"foreign","confidence":1,"probabilities":{"t0001":1,"none":0}}}}`,
		`{"model":"jev-test","answers":{"selection":{"type":"choice","choice":"t0001","confidence":1,"probabilities":{"t0001":0.5,"none":0.1}}}}`,
	} {
		if _, err := DecodeChoice([]byte(raw), []string{"t0001", "none"}); err == nil {
			t.Fatal("accepted invalid distribution")
		}
	}
}
