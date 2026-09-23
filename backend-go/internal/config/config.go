// Package config validates explicit bootstrap configuration.
package config

import (
	"errors"
	"net/netip"
)

// ListenAddress accepts only loopback until the authenticated service is built.
// An empty value selects the documented local development address.
func ListenAddress(raw string) (string, error) {
	if raw == "" {
		return "127.0.0.1:9081", nil
	}
	addr, err := netip.ParseAddrPort(raw)
	if err != nil || !addr.Addr().IsLoopback() || addr.Port() == 0 {
		return "", errors.New("TOOLGATE_LISTEN_ADDR must be a loopback IP and nonzero port")
	}
	return addr.String(), nil
}
