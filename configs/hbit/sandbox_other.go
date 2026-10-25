//go:build !linux || !arm64

package main

import "errors"

func restrictProcess() error {
	return errors.New("Hbit runtime requires the Linux ARM64 sandbox; use tests for local development")
}
