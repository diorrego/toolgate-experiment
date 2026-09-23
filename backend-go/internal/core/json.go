// Package core implements the independent remote selection and decision service.
package core

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"unicode/utf8"

	"github.com/gowebpki/jcs"
)

var errJSON = errors.New("invalid JSON")

// ParseJSON detects duplicate decoded keys before they can be overwritten.
func ParseJSON(raw []byte) (any, error) {
	if !utf8.Valid(raw) {
		return nil, errJSON
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var parse func(int) (any, error)
	parse = func(depth int) (any, error) {
		if depth > 32 {
			return nil, errJSON
		}
		token, err := decoder.Token()
		if err != nil {
			return nil, errJSON
		}
		switch v := token.(type) {
		case json.Delim:
			if v == '{' {
				object := map[string]any{}
				for decoder.More() {
					keyToken, e := decoder.Token()
					if e != nil {
						return nil, errJSON
					}
					key, ok := keyToken.(string)
					if !ok || dangerous(key) {
						return nil, errJSON
					}
					if _, exists := object[key]; exists {
						return nil, errJSON
					}
					child, e := parse(depth + 1)
					if e != nil {
						return nil, e
					}
					object[key] = child
					if len(object) > 10000 {
						return nil, errJSON
					}
				}
				end, e := decoder.Token()
				if e != nil || end != json.Delim('}') {
					return nil, errJSON
				}
				return object, nil
			}
			if v == '[' {
				array := []any{}
				for decoder.More() {
					child, e := parse(depth + 1)
					if e != nil {
						return nil, e
					}
					array = append(array, child)
					if len(array) > 10000 {
						return nil, errJSON
					}
				}
				end, e := decoder.Token()
				if e != nil || end != json.Delim(']') {
					return nil, errJSON
				}
				return array, nil
			}
			return nil, errJSON
		case json.Number:
			n, e := v.Float64()
			if e != nil || math.IsNaN(n) || math.IsInf(n, 0) || (math.Trunc(n) == n && math.Abs(n) > 9007199254740991) {
				return nil, errJSON
			}
			return n, nil
		default:
			return token, nil
		}
	}
	result, err := parse(0)
	if err != nil {
		return nil, err
	}
	if _, err = decoder.Token(); err != io.EOF {
		return nil, errJSON
	}
	return result, nil
}
func dangerous(key string) bool {
	return key == "__proto__" || key == "constructor" || key == "prototype"
}

// Canonical uses the pinned RFC8785 implementation, not encoding/json ordering.
func Canonical(value any) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return jcs.Transform(raw)
}
func digest(value any) (string, error) {
	raw, e := Canonical(value)
	if e != nil {
		return "", e
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
func valueProfile(value any, depth int) bool {
	if depth > 32 {
		return false
	}
	switch v := value.(type) {
	case map[string]any:
		if len(v) > 256 {
			return false
		}
		for k, c := range v {
			if dangerous(k) || !valueProfile(c, depth+1) {
				return false
			}
		}
	case []any:
		if len(v) > 1000 {
			return false
		}
		for _, c := range v {
			if !valueProfile(c, depth+1) {
				return false
			}
		}
	}
	return true
}
