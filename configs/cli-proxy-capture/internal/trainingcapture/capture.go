package trainingcapture

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type CollectorConfig struct {
	Source, ProxyVersion             string
	Keys                             []string
	CurrentKeys                      func() []string
	MemoryBytes, MaxInteractionBytes int64
	Queue                            int
	Sink                             func(Record) error
	Rotate                           func() error
	CloseSink                        func() error
	Report                           func(Counters) error
}

type Counters struct{ Enqueued, Persisted, Dropped, Errors, Unsupported, MemoryBytes int64 }
type Collector struct {
	cfg                                                     CollectorConfig
	queue                                                   chan *interaction
	done                                                    chan struct{}
	closing                                                 atomic.Bool
	reporting                                               atomic.Bool
	gate                                                    sync.RWMutex
	memory, enqueued, persisted, dropped, errs, unsupported atomic.Int64
}

type interaction struct {
	owner             *Collector
	record            Record
	request, response []byte
	charge            int64
	keys              []string
	failed            bool
}

func NewCollector(cfg CollectorConfig) *Collector {
	if cfg.MemoryBytes == 0 {
		cfg.MemoryBytes = 256 << 20
	}
	if cfg.MaxInteractionBytes == 0 {
		cfg.MaxInteractionBytes = 64 << 20
	}
	if cfg.Queue == 0 {
		cfg.Queue = 128
	}
	c := &Collector{cfg: cfg, queue: make(chan *interaction, cfg.Queue), done: make(chan struct{})}
	go c.worker()
	return c
}
func (c *Collector) Stats() Counters {
	return Counters{c.enqueued.Load(), c.persisted.Load(), c.dropped.Load(), c.errs.Load(), c.unsupported.Load(), c.memory.Load()}
}
func (c *Collector) reserve(n int64) bool {
	for {
		old := c.memory.Load()
		if n > c.cfg.MemoryBytes-old {
			return false
		}
		if c.memory.CompareAndSwap(old, old+n) {
			return true
		}
	}
}
func (x *interaction) release() { x.owner.memory.Add(-x.charge); x.charge = 0 }
func (x *interaction) append(dst *[]byte, b []byte) {
	if x.failed {
		return
	}
	if int64(len(x.request)+len(x.response)+len(b)) > x.owner.cfg.MaxInteractionBytes {
		x.failed = true
		return
	}
	size := len(*dst) + len(b)
	if size > cap(*dst) {
		capacity := max(size, max(256, cap(*dst)*2))
		// Reserve expansion headroom for old/new buffers, base64, JSON parsing and
		// scrubbed copies. This bounds accounted buffers, not Go runtime overhead.
		charge := int64(capacity) * 16
		if !x.owner.reserve(charge) {
			x.failed = true
			return
		}
		x.charge += charge
		next := make([]byte, len(*dst), capacity)
		copy(next, *dst)
		*dst = next
	}
	*dst = append(*dst, b...)
}
func (c *Collector) begin(r *http.Request) *interaction {
	if c.closing.Load() || !c.reserve(1024) {
		c.dropped.Add(1)
		return nil
	}
	x := &interaction{owner: c, charge: 1024, record: Record{Schema: 1, ID: randomID(), Source: c.cfg.Source, ProxyVersion: c.cfg.ProxyVersion, Started: time.Now().UTC(), Method: r.Method, Path: r.URL.Path, Client: "unknown", RequestType: r.Header.Get("Content-Type"), Scrubber: ScrubberVersion}}
	if x.record.ID == "" {
		x.release()
		c.dropped.Add(1)
		return nil
	}
	return x
}
func (c *Collector) finish(x *interaction) {
	if x.failed {
		x.release()
		c.dropped.Add(1)
		return
	}
	c.gate.RLock()
	defer c.gate.RUnlock()
	if c.closing.Load() {
		x.release()
		c.dropped.Add(1)
		return
	}
	select {
	case c.queue <- x:
		c.enqueued.Add(1)
	default:
		x.release()
		c.dropped.Add(1)
	}
}
func (c *Collector) persist(x *interaction) {
	defer x.release()
	defer func() {
		if recover() != nil {
			c.errs.Add(1)
			c.dropped.Add(1)
		}
	}()
	r := x.record
	r.Complete = true
	var n int
	var err error
	keys := append(append([]string(nil), c.cfg.Keys...), x.keys...)
	if c.cfg.CurrentKeys != nil {
		keys = append(keys, c.cfg.CurrentKeys()...)
	}
	r.Request, n, err = Scrub(x.request, r.RequestType, keys)
	r.ScrubCount += n
	if err != nil {
		r.Complete = false
		r.Reason = "unsupported_request_body"
		r.Request = nil
	}
	r.Response, n, err = Scrub(x.response, r.ResponseType, keys)
	r.ScrubCount += n
	if err != nil {
		r.Complete = false
		r.Reason = "unsupported_response_body"
		r.Response = nil
	}
	if r.Canceled {
		r.Complete = false
		r.Reason = "client_canceled"
	}
	if x.record.Reason != "" {
		r.Complete = false
		if r.Reason == "" {
			r.Reason = x.record.Reason
		}
	}
	r.RequestSHA256 = digest(r.Request)
	r.ResponseSHA256 = digest(r.Response)
	annotateModels(&r)
	// Original transport chunk lengths are not offsets into the scrubbed encoding.
	if c.cfg.Sink == nil || c.cfg.Sink(r) != nil {
		c.errs.Add(1)
		c.dropped.Add(1)
		return
	}
	c.persisted.Add(1)
}
func (c *Collector) worker() {
	defer close(c.done)
	ticker := time.NewTicker(time.Minute)
	statusTicker := time.NewTicker(10 * time.Second)
	defer statusTicker.Stop()
	defer ticker.Stop()
	for {
		select {
		case x, ok := <-c.queue:
			if !ok {
				if c.cfg.CloseSink != nil {
					if err := safeCall(c.cfg.CloseSink); err != nil {
						c.errs.Add(1)
					}
				}
				return
			}
			c.persist(x)
		case <-statusTicker.C:
			c.report()
		case <-ticker.C:
			if c.cfg.Rotate != nil {
				if err := safeCall(c.cfg.Rotate); err != nil {
					c.errs.Add(1)
				}
			}
		}
	}
}
func safeCall(f func() error) (err error) {
	defer func() {
		if recover() != nil {
			err = errors.New("capture worker panic")
		}
	}()
	return f()
}
func (c *Collector) Close(ctx context.Context) error {
	c.gate.Lock()
	if c.closing.CompareAndSwap(false, true) {
		close(c.queue)
	}
	c.gate.Unlock()
	select {
	case <-c.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func Eligible(r *http.Request) bool {
	if r.Method != "POST" || r.Header.Get("Upgrade") != "" {
		return false
	}
	p := r.URL.Path
	switch p {
	case "/v1/chat/completions", "/v1/completions", "/v1/messages", "/v1/responses", "/v1/responses/compact", "/backend-api/codex/responses", "/backend-api/codex/responses/compact", "/v1beta/interactions":
		return true
	}
	return strings.HasPrefix(p, "/v1beta/models/") && (strings.HasSuffix(p, ":generateContent") || strings.HasSuffix(p, ":streamGenerateContent"))
}

type teeBody struct {
	io.ReadCloser
	x *interaction
}

func (b *teeBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.x.append(&b.x.request, p[:n])
	if err != nil && err != io.EOF {
		b.x.record.Reason = "request_read_error"
	}
	return n, err
}

type captureWriter struct {
	http.ResponseWriter
	x      *interaction
	status int
}

func (w *captureWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *captureWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	n, err := w.ResponseWriter.Write(b)
	w.x.append(&w.x.response, b[:n])
	if !w.x.failed {
		if len(w.x.record.ResponseChunks) < 65536 && w.x.owner.reserve(32) {
			w.x.charge += 32
			w.x.record.ResponseChunks = append(w.x.record.ResponseChunks, n)
		} else {
			w.x.failed = true
		}
	}
	if err != nil {
		w.x.record.Reason = "response_write_error"
	}
	return n, err
}
func (w *captureWriter) Flush() {
	if w.status == 0 {
		w.status = 200
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (w *captureWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// HTTPMiddleware must run after access authentication, never around auth endpoints.
func (c *Collector) HTTPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !Eligible(r) {
			if r.Header.Get("Upgrade") != "" {
				c.unsupported.Add(1)
			}
			next.ServeHTTP(w, r)
			return
		}
		x := c.begin(r)
		if x == nil {
			next.ServeHTTP(w, r)
			return
		}
		started := time.Now()
		if r.Body != nil {
			r.Body = &teeBody{r.Body, x}
		}
		cw := &captureWriter{ResponseWriter: w, x: x}
		defer func() {
			x.record.Status = cw.status
			if x.record.Status == 0 {
				x.record.Status = 200
			}
			x.record.DurationNS = time.Since(started).Nanoseconds()
			x.record.ResponseType = w.Header().Get("Content-Type")
			x.record.Canceled = r.Context().Err() != nil
			c.finish(x)
		}()
		next.ServeHTTP(cw, r)
	})
}

// Observation lets framework adapters tee bytes while retaining their native
// writer's status, flush, hijack and header behavior.
type Observation struct {
	x       *interaction
	started time.Time
}

func (c *Collector) Observe(r *http.Request, credential string) *Observation {
	if !Eligible(r) {
		if r.Header.Get("Upgrade") != "" {
			c.unsupported.Add(1)
		}
		return nil
	}
	x := c.begin(r)
	if x == nil {
		return nil
	}
	if credential != "" {
		x.keys = append(x.keys, credential)
	}
	if r.Body != nil {
		r.Body = &teeBody{r.Body, x}
	}
	return &Observation{x: x, started: time.Now()}
}
func (o *Observation) WriteResponse(b []byte) {
	o.x.append(&o.x.response, b)
	if !o.x.failed {
		if len(o.x.record.ResponseChunks) < 65536 && o.x.owner.reserve(32) {
			o.x.charge += 32
			o.x.record.ResponseChunks = append(o.x.record.ResponseChunks, len(b))
		} else {
			o.x.failed = true
		}
	}
}
func (o *Observation) Fail(reason string) { o.x.record.Reason = reason }
func (o *Observation) Finish(status int, contentType string, canceled bool) {
	o.x.record.Status = status
	o.x.record.ResponseType = contentType
	o.x.record.Canceled = canceled
	o.x.record.DurationNS = time.Since(o.started).Nanoseconds()
	o.x.owner.finish(o.x)
}

func (c *Collector) report() {
	if c.cfg.Report != nil && c.reporting.CompareAndSwap(false, true) {
		go func() {
			defer c.reporting.Store(false)
			if err := safeCall(func() error { return c.cfg.Report(c.Stats()) }); err != nil {
				c.errs.Add(1)
			}
		}()
	}
}
