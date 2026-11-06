package trainingcapture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func makeSegment(t *testing.T) (string, Manifest) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "spool")
	s, e := NewSpool(SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Append(Record{Schema: 1, ID: randomID(), Source: "fixture", Request: []byte(`{}`)}); e != nil {
		t.Fatal(e)
	}
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	files, _ := filepath.Glob(filepath.Join(root, "sealed", "*.manifest.json"))
	m, e := loadManifest(files[0])
	if e != nil {
		t.Fatal(e)
	}
	return root, m
}
func TestArchiveVerifiedReceiptAndIdempotency(t *testing.T) {
	spool, m := makeSegment(t)
	root := filepath.Join(t.TempDir(), "archive")
	segment := filepath.Join(spool, "sealed", m.ID+".jsonl.gz")
	data, e := os.ReadFile(segment)
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 2; i++ {
		got, e := Receive(root, m, bytes.NewReader(data))
		if e != nil || got != m {
			t.Fatalf("receive %v", e)
		}
	}
	bad := m
	bad.SHA256 = digest([]byte("bad"))
	if _, e := Receive(root, bad, bytes.NewReader(data)); e == nil {
		t.Fatal("hash conflict accepted")
	}
	if e = Ship(context.Background(), spool, func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) { return Receive(root, m, r) }); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(segment); !os.IsNotExist(e) {
		t.Fatal("acknowledged source not removed")
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
			t.Errorf("mode %s", p)
		}
		return nil
	})
}
func TestArchiveNeverDeletesWithoutExactReceipt(t *testing.T) {
	for _, kind := range []string{"timeout", "bad-receipt", "lost-ack", "corrupt"} {
		t.Run(kind, func(t *testing.T) {
			spool, m := makeSegment(t)
			root := filepath.Join(t.TempDir(), "archive")
			transfer := func(ctx context.Context, manifest Manifest, r io.Reader) (Manifest, error) {
				switch kind {
				case "timeout":
					return Manifest{}, context.DeadlineExceeded
				case "bad-receipt":
					manifest.Records++
					return manifest, nil
				case "lost-ack":
					_, e := Receive(root, manifest, r)
					if e != nil {
						t.Fatal(e)
					}
					return Manifest{}, errors.New("lost ack")
				default:
					_, e := Receive(root, manifest, bytes.NewReader([]byte("bad")))
					return Manifest{}, e
				}
			}
			if e := Ship(context.Background(), spool, transfer); e == nil {
				t.Fatal("bad transfer passed")
			}
			if _, e := os.Stat(filepath.Join(spool, "sealed", m.ID+".jsonl.gz")); e != nil {
				t.Fatal("unacknowledged source deleted")
			}
			if e := Ship(context.Background(), spool, func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) { return Receive(root, m, r) }); e != nil {
				t.Fatal(e)
			}
		})
	}
}
func TestReceiverRejectsInvalidFrame(t *testing.T) {
	m := Manifest{Schema: 1, ID: randomID(), SHA256: digest([]byte("not gzip")), Bytes: 8, Records: 1}
	if _, e := Receive(filepath.Join(t.TempDir(), "archive"), m, bytes.NewReader([]byte("not gzip"))); e == nil {
		t.Fatal("invalid gzip accepted")
	}
	b, _ := json.Marshal(m)
	_ = b
}

func TestArchiveRejectsDifferentValidSegmentSameID(t *testing.T) {
	spoolA, a := makeSegment(t)
	spoolB, b := makeSegment(t)
	root := filepath.Join(t.TempDir(), "archive")
	dataA, err := os.ReadFile(filepath.Join(spoolA, "sealed", a.ID+".jsonl.gz"))
	if err != nil {
		t.Fatal(err)
	}
	dataB, err := os.ReadFile(filepath.Join(spoolB, "sealed", b.ID+".jsonl.gz"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Receive(root, a, bytes.NewReader(dataA)); err != nil {
		t.Fatal(err)
	}
	b.ID = a.ID
	if _, err = Receive(root, b, bytes.NewReader(dataB)); err == nil {
		t.Fatal("accepted different valid content for existing ID")
	}
	var segments int
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if filepath.Ext(path) == ".gz" {
			segments++
		}
		return nil
	})
	if segments != 1 {
		t.Fatalf("stored %d segments for one ID", segments)
	}
}

func TestShipRetainsReceiptAndRejectsReusedIDBeforeTransfer(t *testing.T) {
	spool, a := makeSegment(t)
	archive := filepath.Join(t.TempDir(), "archive")
	if err := Ship(context.Background(), spool, func(ctx context.Context, m Manifest, r io.Reader) (Manifest, error) { return Receive(archive, m, r) }); err != nil {
		t.Fatal(err)
	}
	if prior, err := loadManifest(filepath.Join(spool, "receipts", a.ID+".json")); err != nil || prior != a {
		t.Fatal("durable receipt missing")
	}
	other, b := makeSegment(t)
	data, err := os.ReadFile(filepath.Join(other, "sealed", b.ID+".jsonl.gz"))
	if err != nil {
		t.Fatal(err)
	}
	b.ID = a.ID
	manifest, _ := json.Marshal(b)
	os.WriteFile(filepath.Join(spool, "sealed", a.ID+".jsonl.gz"), data, 0600)
	os.WriteFile(filepath.Join(spool, "sealed", a.ID+".manifest.json"), manifest, 0600)
	called := false
	err = Ship(context.Background(), spool, func(context.Context, Manifest, io.Reader) (Manifest, error) { called = true; return b, nil })
	if err == nil || called {
		t.Fatal("reused ID not rejected before transfer")
	}
}
