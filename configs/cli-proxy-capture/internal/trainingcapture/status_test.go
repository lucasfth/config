package trainingcapture

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStatusPrivateAndBlockedReportDoesNotDelayCapture(t *testing.T) {
	root := t.TempDir()
	counters := Counters{Enqueued: 7, Dropped: 2, Errors: 1}
	if err := WriteStatus(root, counters); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "status.json")
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("status mode")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var status struct {
		Counters Counters `json:"counters"`
	}
	if err = json.Unmarshal(b, &status); err != nil || status.Counters != counters {
		t.Fatal("status counters")
	}
	entered, release, persisted := make(chan struct{}), make(chan struct{}), make(chan struct{})
	c := NewCollector(CollectorConfig{Report: func(Counters) error { close(entered); <-release; return nil }, Sink: func(Record) error { close(persisted); return nil }})
	c.report()
	<-entered
	c.report()
	h := c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{}`)
	}))
	r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(httptest.NewRecorder(), r)
	select {
	case <-persisted:
	case <-time.After(time.Second):
		t.Fatal("report blocked persistence")
	}
	if err = c.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	close(release)
}
