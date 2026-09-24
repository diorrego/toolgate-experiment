package core

import (
	"errors"
	js "github.com/santhosh-tekuri/jsonschema/v6"
	"strings"
)

// This finite vocabulary has linear-time matchers and ECMAScript character rules.
// Arbitrary regular expressions remain unsupported by the catalog profile.
var wokuPatterns = map[string]bool{
	`^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$`: true, `\S`: true,
	`^(?=.*[0-9])[+]?[0-9()\-\s.]+$`: true, `^[a-f0-9]{24}$`: true,
	`^[0-9a-fA-F]{24}$`: true, `\D`: true,
}

type wokuPattern string

func (p wokuPattern) String() string { return string(p) }
func ecmaSpace(r rune) bool {
	return strings.ContainsRune("\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff", r)
}
func ecmaLine(r rune) bool { return r == '\n' || r == '\r' || r == '\u2028' || r == '\u2029' }
func (p wokuPattern) MatchString(s string) bool {
	switch string(p) {
	case `\S`:
		for _, r := range s {
			if !ecmaSpace(r) {
				return true
			}
		}
		return false
	case `\D`:
		for _, r := range s {
			if r < '0' || r > '9' {
				return true
			}
		}
		return false
	case `^(?=.*[0-9])[+]?[0-9()\-\s.]+$`:
		digit := false
		for _, r := range s {
			if ecmaLine(r) {
				break
			}
			if r >= '0' && r <= '9' {
				digit = true
			}
		}
		if !digit {
			return false
		}
		s = strings.TrimPrefix(s, "+")
		if len(s) == 0 {
			return false
		}
		for _, r := range s {
			if !(r >= '0' && r <= '9' || strings.ContainsRune("()-. ", r) || ecmaSpace(r)) {
				return false
			}
		}
		return true
	default:
		// Without multiline, ECMAScript $ requires the actual end of input.
		hex := func(s string, upper bool) bool {
			for _, r := range s {
				if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || upper && r >= 'A' && r <= 'F') {
					return false
				}
			}
			return true
		}
		if string(p) == `^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$` {
			return strings.HasPrefix(s, "#") && (len(s) == 4 || len(s) == 7) && hex(s[1:], true)
		}
		return len(s) == 24 && hex(s, string(p) == `^[0-9a-fA-F]{24}$`)
	}
}
func compileWokuPattern(s string) (js.Regexp, error) {
	if !wokuPatterns[s] {
		return nil, errors.New("unsupported pattern")
	}
	return wokuPattern(s), nil
}
