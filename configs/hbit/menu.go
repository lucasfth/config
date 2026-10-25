package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed menu.json
var menuJSON []byte

var sharedMenu = func() struct {
	Name string `json:"name"`
	Items []struct {
		ID string `json:"id"`
		Key string `json:"key"`
		Title string `json:"title"`
		Lines []string `json:"lines"`
	} `json:"items"`
} {
	var data struct {
		Name string `json:"name"`
		Items []struct {
			ID string `json:"id"`
			Key string `json:"key"`
			Title string `json:"title"`
			Lines []string `json:"lines"`
		} `json:"items"`
	}
	if err := json.Unmarshal(menuJSON, &data); err != nil { panic(err) }
	return data
}()

func menuBanner() string {
	var text strings.Builder
	fmt.Fprintf(&text, "\r\n%s\r\n\r\n", sharedMenu.Name)
	for _, item := range sharedMenu.Items { fmt.Fprintf(&text, "%s  %s\r\n", item.Key, item.Title) }
	text.WriteString("q  Quit\r\n\r\n")
	return text.String()
}

func menuCommand(command string) (string, bool) {
	command = strings.ToLower(strings.TrimSpace(command))
	switch command {
	case "q", "quit", "exit": return "Goodbye!", true
	case "?": command = "help"
	}
	for _, item := range sharedMenu.Items {
		if command == item.Key || command == item.ID { return strings.Join(item.Lines, "\r\n"), false }
	}
	return "Unknown command. Choose 1, 2, 3, or q.", false
}
