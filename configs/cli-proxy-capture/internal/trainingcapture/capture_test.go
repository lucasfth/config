package trainingcapture

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCaptureHTTPUnchangedAndScrubbed(t *testing.T) {
	var stored []Record
	c := NewCollector(CollectorConfig{Source: "fixture", Sink: func(r Record) error { stored = append(stored, r); return nil }})
	handler := c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !bytes.Contains(b, []byte("private-token-123")) {
			t.Error("live request changed")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"sk-proj-\"}}]}\n\n")
		w.(http.Flusher).Flush()
		io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\""+strings.Repeat("A", 32)+"\"}}]}\n\ndata: [DONE]\n\n")
	}))
	request := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(`{"messages":[{"content":"Bearer private-token-123"}]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer do-not-save-headers")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, request)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := c.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), strings.Repeat("A", 32)) {
		t.Fatal("live response changed")
	}
	if len(stored) != 1 {
		t.Fatalf("stored %d stats %+v", len(stored), c.Stats())
	}
	r := stored[0]
	if !r.Complete || r.ScrubCount != 2 || bytes.Contains(r.Request, []byte("private-token-123")) || bytes.Contains(r.Response, []byte(strings.Repeat("A", 32))) {
		t.Fatalf("bad capture %+v", r)
	}
	if c.Stats().MemoryBytes != 0 {
		t.Fatal("memory reservation leaked")
	}
}

func TestCaptureFailureAndBudgetDoNotBreakInference(t *testing.T) {
	blocked := make(chan struct{})
	entered := make(chan struct{}, 1)
	c := NewCollector(CollectorConfig{MemoryBytes: 32768, MaxInteractionBytes: 100, Queue: 1, Sink: func(Record) error {
		select {
		case entered <- struct{}{}:
		default:
		}
		<-blocked
		return nil
	}})
	h := c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"ok":true}`)
	}))
	run := func() {
		r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"x":"short"}`))
		r.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		if rr.Body.String() != `{"ok":true}` {
			t.Fatal("inference failed")
		}
	}
	run()
	if stats := c.Stats(); stats.Enqueued != 1 || stats.Dropped != 0 || stats.Errors != 0 {
		t.Fatalf("first capture admission failed: %+v", stats)
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("worker did not start")
	}
	for i := 0; i < 20; i++ {
		run()
	}
	if c.Stats().Dropped == 0 {
		t.Fatal("did not report backpressure")
	}
	close(blocked)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := c.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if c.Stats().MemoryBytes != 0 {
		t.Fatal("reservation leak")
	}
	c = NewCollector(CollectorConfig{Sink: func(Record) error { panic("synthetic") }})
	h = c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{}`)
	}))
	rr := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, r)
	if err := c.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if rr.Code != 200 || c.Stats().Errors == 0 {
		t.Fatal("panic not isolated")
	}
}

func TestCaptureSkipsCredentialsAndUpgrades(t *testing.T) {
	var saved int
	c := NewCollector(CollectorConfig{Sink: func(Record) error { saved++; return nil }})
	h := c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	for _, path := range []string{"/v0/management/api-keys", "/v1/realtime/client_secrets", "/anthropic/callback", "/v1/models"} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
	}
	r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{}`))
	r.Header.Set("Upgrade", "websocket")
	h.ServeHTTP(httptest.NewRecorder(), r)
	if err := c.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if saved != 0 {
		t.Fatal("captured credential/control endpoint")
	}
}

func TestObservationCredentialPanicAndReservationRelease(t *testing.T) {
	root := filepath.Join(t.TempDir(), "capture")
	spool, err := NewSpool(SpoolConfig{Root: root, Available: func() (uint64, error) { return 1 << 40, nil }})
	if err != nil {
		t.Fatal(err)
	}
	c := NewCollector(CollectorConfig{Sink: spool.Append, CloseSink: spool.Close})
	func() {
		defer func() {
			if recover() == nil {
				t.Error("expected handler panic")
			}
		}()
		r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"text":"custom-client-credential-123"}`))
		r.Header.Set("Content-Type", "application/json")
		o := c.Observe(r, "custom-client-credential-123")
		if o == nil {
			t.Fatal("observation dropped")
		}
		defer o.Finish(200, "application/json", false)
		io.Copy(io.Discard, r.Body)
		o.WriteResponse([]byte(`{"ok":true}`))
		panic("handler panic")
	}()
	if err = c.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if stats := c.Stats(); stats.MemoryBytes != 0 || stats.Persisted != 1 {
		t.Fatalf("stats %+v", stats)
	}
	files, _ := filepath.Glob(filepath.Join(root, "sealed", "*.jsonl.gz"))
	if len(files) != 1 {
		t.Fatal("no sealed segment")
	}
	data, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatal(err)
	}
	_ = data
	records := readSegmentRecords(t, files[0])
	if bytes.Contains(records[0].Request, []byte("custom-client-credential-123")) {
		t.Fatal("credential persisted")
	}
}

func TestModelProvenancePreservesAliasAndReportedTeacher(t *testing.T) {
	for _, response := range []string{`{"model":"fixture-upstream","choices":[]}`, `{"choices":[]}`} {
		var saved Record
		c := NewCollector(CollectorConfig{Sink: func(r Record) error { saved = r; return nil }})
		h := c.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			io.Copy(io.Discard, r.Body)
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, response)
		}))
		r := httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(`{"model":"fixture-alias","messages":[]}`))
		r.Header.Set("Content-Type", "application/json")
		h.ServeHTTP(httptest.NewRecorder(), r)
		if err := c.Close(context.Background()); err != nil {
			t.Fatal(err)
		}
		if saved.RequestedModel != "fixture-alias" {
			t.Fatal("requested alias lost")
		}
		if strings.Contains(response, "fixture-upstream") {
			if len(saved.ReportedModels) != 1 || saved.ReportedModels[0] != "fixture-upstream" || saved.ModelProvenance != "response_reported" {
				t.Fatalf("teacher provenance %+v", saved)
			}
		} else if saved.ModelProvenance != "unknown" {
			t.Fatal("invented teacher provenance")
		}
		if saved.ResolvedModel != "" || saved.ResolvedProvider != "" {
			t.Fatal("inferred unobserved upstream identity")
		}
	}
}
