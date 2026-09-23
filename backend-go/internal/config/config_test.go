package config

import "testing"

func TestLocalListenAddress(t *testing.T) {
	for _, tc := range []struct {
		raw, want string
		invalid   bool
	}{
		{"", "127.0.0.1:9081", false},
		{"127.0.0.1:19081", "127.0.0.1:19081", false},
		{"[::1]:9081", "[::1]:9081", false},
		{"0.0.0.0:9081", "", true},
		{":9081", "", true},
		{"remote.example:9081", "", true},
		{"127.0.0.1:0", "", true},
		{"127.0.0.1:invalid", "", true},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			got, err := ListenAddress(tc.raw)
			if (err != nil) != tc.invalid {
				t.Fatalf("error = %v; invalid = %v", err, tc.invalid)
			}
			if got != tc.want {
				t.Fatalf("address = %q; want %q", got, tc.want)
			}
		})
	}
}
