package trainingcapture

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestShipRetainsAcknowledgedSourceAndSkipsRepeatUpload(t *testing.T) {
	spool, m := makeSegment(t)
	archive := filepath.Join(t.TempDir(), "archive")
	calls := 0
	transfer := func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) {
		calls++
		return Receive(archive, m, r)
	}
	for i := 0; i < 2; i++ {
		if err := ShipWithOptions(context.Background(), spool, transfer, ShipOptions{RetainSource: true}); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("uploads=%d", calls)
	}
	for _, path := range []string{filepath.Join(spool, "sealed", m.ID+".jsonl.gz"), filepath.Join(spool, "sealed", m.ID+".manifest.json")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatal("source missing", err)
		}
	}
	receipt, err := loadManifest(filepath.Join(spool, "receipts", m.ID+".json"))
	if err != nil || receipt != m {
		t.Fatal("missing matching receipt", err)
	}
	reclaimed, err := readReclaimed(spool)
	if err != nil || reclaimed != 0 {
		t.Fatal("retained source reclaimed", err)
	}
	if err := os.WriteFile(filepath.Join(spool, "sealed", m.ID+".jsonl.gz"), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := ShipWithOptions(context.Background(), spool, transfer, ShipOptions{RetainSource: true}); err == nil {
		t.Fatal("receipt bypassed local verification")
	}
}
