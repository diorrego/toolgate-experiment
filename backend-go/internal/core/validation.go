package core

import (
	_ "embed"
	"errors"
	"fmt"
	"sort"
	"strings"

	js "github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
)

//go:embed api.generated.json
var apiBytes []byte

type denyLoader struct{}

func (denyLoader) Load(string) (any, error) {
	return nil, errors.New("external schema loading disabled")
}
func compiler() *js.Compiler {
	c := js.NewCompiler()
	c.DefaultDraft(js.Draft2020)
	c.UseLoader(denyLoader{})
	return c
}
func wireSchemas() (map[string]*js.Schema, error) {
	raw, err := ParseJSON(apiBytes)
	if err != nil {
		return nil, err
	}
	object, ok := raw.(map[string]any)
	if !ok {
		return nil, errJSON
	}
	defs, ok := object["$defs"].(map[string]any)
	if !ok {
		return nil, errJSON
	}
	c := compiler()
	c.AssertFormat()
	if err = c.AddResource("https://toolgate.invalid/api", raw); err != nil {
		return nil, err
	}
	result := map[string]*js.Schema{}
	for name := range defs {
		schema, e := c.Compile("https://toolgate.invalid/api#/$defs/" + name)
		if e != nil {
			return nil, e
		}
		result[name] = schema
	}
	return result, nil
}

type Issue struct {
	Code         string `json:"code"`
	InstancePath string `json:"instance_path"`
	SchemaPath   string `json:"schema_path"`
	MessageKey   string `json:"message_key"`
}

func pointer(parts []string) string {
	result := ""
	for _, p := range parts {
		result += "/" + strings.ReplaceAll(strings.ReplaceAll(p, "~", "~0"), "/", "~1")
	}
	return result
}
func compileTool(schema map[string]any) (*js.Schema, error) {
	if err := schemaProfile(schema); err != nil {
		return nil, err
	}
	c := compiler()
	c.UseRegexpEngine(compileWokuPattern)
	if err := c.AddResource("https://toolgate.invalid/tool", schema); err != nil {
		return nil, err
	}
	return c.Compile("https://toolgate.invalid/tool")
}

// ValidateArguments is also used by deterministic unit fixtures.
func ValidateArguments(schema map[string]any, args map[string]any) ([]Issue, []string, error) {
	compiled, e := compileTool(schema)
	if e != nil {
		return nil, nil, e
	}
	issues, missing := validateCompiled(compiled, args)
	return issues, missing, nil
}
func validateCompiled(compiled *js.Schema, args map[string]any) ([]Issue, []string) {
	issues := []Issue{}
	missing := []string{}
	raw, e := Canonical(args)
	if e != nil || len(raw) > 65536 || !valueProfile(args, 0) {
		return []Issue{{"unsupported_value", "", "#", "toolgate.validation.unsupported_value"}}, missing
	}
	err := compiled.Validate(args)
	if err == nil {
		return issues, missing
	}
	var validation *js.ValidationError
	if !errors.As(err, &validation) {
		return []Issue{{"unsupported_value", "", "#", "toolgate.validation.unsupported_value"}}, missing
	}
	var walk func(*js.ValidationError)
	walk = func(v *js.ValidationError) {
		keyword := v.ErrorKind.KeywordPath()
		key := ""
		if len(keyword) > 0 {
			key = keyword[0]
		}
		location := "#"
		if at := strings.Index(v.SchemaURL, "#"); at >= 0 {
			location = v.SchemaURL[at:]
		}
		schemaPath := location + pointer(keyword)
		code := key
		switch key {
		case "additionalProperties":
			code = "additional_property"
		case "minLength", "maxLength":
			code = "length"
		case "minItems", "maxItems", "items":
			code = "items"
		case "exclusiveMinimum":
			code = "minimum"
		case "exclusiveMaximum":
			code = "maximum"
		case "pattern", "minProperties", "maxProperties":
			code = "unsupported_value"
		case "oneOf":
			code = "one_of"
		case "anyOf":
			code = "any_of"
		case "allOf":
			code = "all_of"
		}
		if key == "anyOf" || key == "oneOf" {
			issues = append(issues, Issue{code, pointer(v.InstanceLocation), schemaPath, "toolgate.validation." + code})
			return
		}
		if len(v.Causes) > 0 {
			for _, cause := range v.Causes {
				walk(cause)
			}
			return
		}
		if required, ok := v.ErrorKind.(*kind.Required); ok {
			for _, name := range required.Missing {
				path := pointer(append(append([]string{}, v.InstanceLocation...), name))
				issues = append(issues, Issue{"required", path, schemaPath, "toolgate.validation.required"})
				missing = append(missing, path)
			}
			return
		}
		if code == "" {
			code = "unsupported_value"
		}
		issues = append(issues, Issue{code, pointer(v.InstanceLocation), schemaPath, "toolgate.validation." + code})
	}
	walk(validation)
	sort.Slice(issues, func(i, j int) bool {
		a, b := issues[i], issues[j]
		return a.InstancePath+"\x00"+a.SchemaPath+"\x00"+a.Code < b.InstancePath+"\x00"+b.SchemaPath+"\x00"+b.Code
	})
	unique := issues[:0]
	for _, i := range issues {
		if len(unique) == 0 || unique[len(unique)-1] != i {
			unique = append(unique, i)
		}
	}
	issues = unique
	if len(issues) > 128 {
		issues = issues[:128]
	}
	sort.Strings(missing)
	if len(missing) > 128 {
		missing = missing[:128]
	}
	return issues, missing
}
func schemaProfile(root map[string]any) error {
	if !valueProfile(root, 0) {
		return errors.New("schema limits")
	}
	raw, e := Canonical(root)
	if e != nil || len(raw) > 65536 {
		return errors.New("schema limits")
	}
	supported := map[string]bool{}
	for _, k := range strings.Fields("$schema $id $defs $ref type properties required additionalProperties enum const minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength minItems maxItems items minProperties maxProperties allOf anyOf oneOf title description default examples deprecated readOnly writeOnly format pattern") {
		supported[k] = true
	}
	var walk func(any, map[string]bool, int) error
	walk = func(node any, seen map[string]bool, depth int) error {
		if depth > 64 {
			return errors.New("schema recursion")
		}
		if _, ok := node.(bool); ok {
			return nil
		}
		obj, ok := node.(map[string]any)
		if !ok {
			return errors.New("invalid schema")
		}
		if root["$schema"] == "http://json-schema.org/draft-07/schema#" {
			if _, hasRef := obj["$ref"]; hasRef {
				for key := range obj {
					if !contains(strings.Fields("$ref title description default examples deprecated readOnly writeOnly format"), key) {
						return errors.New("draft-07 ref siblings outside common subset")
					}
				}
			}
		}
		for k, value := range obj {
			if !supported[k] {
				return fmt.Errorf("unsupported schema keyword")
			}
			switch k {
			case "pattern":
				p, ok := value.(string)
				if !ok || !wokuPatterns[p] {
					return errors.New("unsupported pattern")
				}
			case "$schema":
				if value != "https://json-schema.org/draft/2020-12/schema" && value != "http://json-schema.org/draft-07/schema#" {
					return errors.New("schema dialect")
				}
			case "$ref":
				ref, ok := value.(string)
				if !ok || !strings.HasPrefix(ref, "#/") || seen[ref] {
					return errors.New("schema reference")
				}
				target := any(root)
				for _, part := range strings.Split(ref[2:], "/") {
					m, ok := target.(map[string]any)
					if !ok {
						return errors.New("schema reference")
					}
					target = m[strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")]
				}
				next := map[string]bool{}
				for key, v := range seen {
					next[key] = v
				}
				next[ref] = true
				if err := walk(target, next, depth+1); err != nil {
					return err
				}
			case "properties", "$defs":
				m, ok := value.(map[string]any)
				if !ok {
					return errors.New("schema map")
				}
				for _, child := range m {
					if err := walk(child, seen, depth+1); err != nil {
						return err
					}
				}
			case "items", "additionalProperties":
				if err := walk(value, seen, depth+1); err != nil {
					return err
				}
			case "allOf", "anyOf", "oneOf":
				list, ok := value.([]any)
				if !ok {
					return errors.New("schema branches")
				}
				for _, child := range list {
					if err := walk(child, seen, depth+1); err != nil {
						return err
					}
				}
			}
		}
		return nil
	}
	return walk(root, map[string]bool{}, 0)
}
