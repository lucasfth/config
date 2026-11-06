package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestShipStatusPrivateAtomicAndFailureVisible(t *testing.T) {
	root := t.TempDir()
	for _, success := range []bool{true, false} {
		want := shipStatus{Started: time.Now().UTC(), Finished: time.Now().UTC(), Success: success, RetainSource: true, Shipped: 2}
		if err := writeShipStatus(root, want); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(root, "ship-status.json")
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0600 {
			t.Fatal("unsafe status mode", err)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var got shipStatus
		if err = json.Unmarshal(data, &got); err != nil || got != want {
			t.Fatalf("status=%+v err=%v", got, err)
		}
	}
	parts, err := filepath.Glob(filepath.Join(root, ".ship-status.*"))
	if err != nil || len(parts) != 0 {
		t.Fatal("temporary files left", err)
	}
}
