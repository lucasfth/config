package trainingcapture

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestSpoolSealPermissionsAndBudget(t *testing.T) {
	root := filepath.Join(t.TempDir(), "capture")
	s, err := NewSpool(SpoolConfig{Root: root, MaxBytes: 1 << 20, FloorBytes: 100, ResumeBytes: 150, Available: func() (uint64, error) { return 100000, nil }})
	if err != nil {
		t.Fatal(err)
	}
	r := Record{Schema: 1, ID: "0123456789abcdef0123456789abcdef", Started: time.Now().UTC(), Request: []byte(`{"model":"fixture"}`)}
	if err = s.Append(r); err != nil {
		t.Fatal(err)
	}
	if err = s.Seal(); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(filepath.Join(root, "sealed", "*.jsonl.gz"))
	if err != nil || len(files) != 1 {
		t.Fatalf("files %v %v", files, err)
	}
	f, err := os.Open(files[0])
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	defer gz.Close()
	b, err := io.ReadAll(gz)
	if err != nil {
		t.Fatal(err)
	}
	var got Record
	if err = json.Unmarshal(b, &got); err != nil || got.ID != r.ID {
		t.Fatalf("record %v", err)
	}
	filepath.Walk(root, func(p string, info os.FileInfo, e error) error {
		if e != nil {
			t.Fatal(e)
		}
		want := os.FileMode(0600)
		if info.IsDir() {
			want = 0700
		}
		if info.Mode().Perm() != want {
			t.Errorf("mode %s %o", p, info.Mode().Perm())
		}
		return nil
	})
	s.cfg.Available = func() (uint64, error) { return 99, nil }
	if err = s.Append(r); err == nil {
		t.Fatal("floor must pause capture")
	}
	files, _ = filepath.Glob(filepath.Join(root, "sealed", "*.jsonl.gz"))
	if len(files) != 1 {
		t.Fatal("budget removed unshipped file")
	}
	s.cfg.Available = func() (uint64, error) { return 149, nil }
	if s.Append(r) == nil {
		t.Fatal("must respect resume hysteresis")
	}
	s.cfg.Available = func() (uint64, error) { return 100000, nil }
	if err = s.Append(r); err != nil {
		t.Fatal(err)
	}
	s.Close()
}

func TestSpoolRejectsSymlinkAndRecoversOpen(t *testing.T) {
	parent := t.TempDir()
	target := filepath.Join(parent, "target")
	os.Mkdir(target, 0700)
	link := filepath.Join(parent, "link")
	os.Symlink(target, link)
	if _, err := NewSpool(SpoolConfig{Root: link}); err == nil {
		t.Fatal("accepted symlink")
	}
	root := filepath.Join(parent, "recover")
	s, err := NewSpool(SpoolConfig{Root: root, FloorBytes: 1, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(root, "open", "crash.part"), []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = NewSpool(SpoolConfig{Root: root, FloorBytes: 1, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	files, _ := filepath.Glob(filepath.Join(root, "quarantine", "*"))
	if len(files) != 1 {
		t.Fatal("crash tail not quarantined")
	}
}

func readSegmentRecords(t *testing.T, path string) []Record {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	defer gz.Close()
	d := json.NewDecoder(gz)
	var out []Record
	for {
		var r Record
		err = d.Decode(&r)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func TestSpoolBudgetChecksExternalSpaceAndReconcilesDeletion(t *testing.T) {
	available := uint64(100000)
	now := time.Unix(123, 0)
	s, err := NewSpool(SpoolConfig{Root: filepath.Join(t.TempDir(), "capture"), FloorBytes: 100, ResumeBytes: 150, Available: func() (uint64, error) { return available, nil }, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	r := Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}
	if err = s.Append(r); err != nil {
		t.Fatal(err)
	}
	if err = s.Seal(); err != nil {
		t.Fatal(err)
	}
	before := s.used
	available = 99
	if s.Append(r) == nil {
		t.Fatal("external disk fill inside sampling interval was missed")
	}
	files, _ := filepath.Glob(filepath.Join(s.cfg.Root, "sealed", "*.jsonl.gz"))
	info, err := os.Stat(files[0])
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Remove(files[0]); err != nil {
		t.Fatal(err)
	}
	if err = s.Reconcile(); err != nil {
		t.Fatal(err)
	}
	if s.used != before-uint64(info.Size()) {
		t.Fatalf("external deletion not reconciled: %d", s.used)
	}
}

func TestSpoolAppendDoesNotWalkBacklog(t *testing.T) {
	root := filepath.Join(t.TempDir(), "capture")
	sealed := filepath.Join(root, "sealed")
	if err := os.MkdirAll(sealed, 0700); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2000; i++ {
		if err := os.WriteFile(filepath.Join(sealed, fmt.Sprintf("fixture-%04d", i)), []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	s, err := NewSpool(SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	walks := s.reconciliations
	r := Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}
	for i := 0; i < 2000; i++ {
		if err = s.Append(r); err != nil {
			t.Fatal(err)
		}
	}
	if s.reconciliations != walks {
		t.Fatal("append walked accumulated backlog")
	}
}

func TestShippingDoesNotRejectConcurrentCapture(t *testing.T) {
	root, m := makeSegment(t)
	now := time.Unix(100, 0)
	s, err := NewSpool(SpoolConfig{Root: root, Now: func() time.Time { return now }, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	entered, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	archive := filepath.Join(t.TempDir(), "archive")
	go func() {
		done <- Ship(context.Background(), root, func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) {
			close(entered)
			<-release
			return Receive(archive, m, r)
		})
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("shipper not entered")
	}
	if err = s.Rotate(); err != nil {
		t.Fatal(err)
	}
	if err = s.Append(Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}); err != nil {
		t.Fatal("shipping rejected capture", err)
	}
	close(release)
	if err = <-done; err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Second)
	if err = s.Append(Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(root, "receipts", m.ID+".json")); err != nil {
		t.Fatal("receipt missing")
	}
}

func TestReconcileExcludesReceiptsAndHandlesStaleReclaim(t *testing.T) {
	root := filepath.Join(t.TempDir(), "capture")
	s, err := NewSpool(SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	r := Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}
	if err = s.Append(r); err != nil {
		t.Fatal(err)
	}
	if err = s.Seal(); err != nil {
		t.Fatal(err)
	}
	before := s.used
	receipts := filepath.Join(root, "receipts")
	if err = os.Mkdir(receipts, 0700); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2000; i++ {
		if err = os.WriteFile(filepath.Join(receipts, fmt.Sprintf("receipt-%d", i)), []byte("retained"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err = s.Reconcile(); err != nil {
		t.Fatal(err)
	}
	if s.used != before {
		t.Fatal("receipts included in payload budget")
	}
	if err = addReclaimed(root, s.used+1); err != nil {
		t.Fatal(err)
	}
	s.checked = time.Time{}
	if err = s.Append(r); err != nil {
		t.Fatal("stale reclaim counter rejected capture instead of reconciling", err)
	}
}

func TestManifestPublishFailureRecoversAfterRestart(t *testing.T) {
	root := filepath.Join(t.TempDir(), "capture")
	cfg := SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }, Rename: func(string, string) error { return errors.New("synthetic manifest rename failure") }}
	s, err := NewSpool(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Append(Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if err = s.Seal(); err == nil {
		t.Fatal("fault not exercised")
	}
	if s.pending == "" {
		t.Fatal("failed publication lost pending segment")
	}
	// Simulate process loss after the failed publish, not a graceful close.
	syscall.Flock(int(s.lock.Fd()), syscall.LOCK_UN)
	s.lock.Close()
	s.lock = nil
	cfg.Rename = nil
	restarted, err := NewSpool(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	files, _ := filepath.Glob(filepath.Join(root, "sealed", "*.jsonl.gz"))
	if len(files) != 1 {
		t.Fatal("completed open gzip not recovered")
	}
	archive := filepath.Join(t.TempDir(), "archive")
	if err = Ship(context.Background(), root, func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) { return Receive(archive, m, r) }); err != nil {
		t.Fatal(err)
	}
	if err = restarted.Reconcile(); err != nil {
		t.Fatal(err)
	}
	if restarted.used != 0 {
		t.Fatalf("payload budget not returned: %d", restarted.used)
	}
}

func TestSealRetriesDirectorySyncWithoutDoubleAccounting(t *testing.T) {
	for _, failureDir := range []string{"open", "sealed"} {
		t.Run(failureDir, func(t *testing.T) {
			fail := true
			root := filepath.Join(t.TempDir(), "capture")
			s, err := NewSpool(SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }, SyncDir: func(path string) error {
				if fail && filepath.Base(path) == failureDir {
					return errors.New("synthetic directory sync failure")
				}
				return syncDir(path)
			}})
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			if err = s.Append(Record{Schema: 1, ID: randomID(), Request: []byte(`{}`)}); err != nil {
				t.Fatal(err)
			}
			if err = s.Seal(); err == nil {
				t.Fatal("sync fault did not fire")
			}
			used := s.used
			fail = false
			if err = s.Seal(); err != nil {
				t.Fatal("retry failed", err)
			}
			if s.used != used || s.publishFailures != 1 {
				t.Fatalf("retry accounting/failures used=%d want=%d failures=%d", s.used, used, s.publishFailures)
			}
		})
	}
}
