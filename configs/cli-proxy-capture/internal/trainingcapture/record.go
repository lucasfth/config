package trainingcapture

import "time"

// Payloads encode as base64 so non-UTF8 wire bytes can be represented explicitly.
// Persisted payloads are credential-scrubbed capture copies, never auth headers.
type Record struct {
	Schema           int       `json:"schema"`
	ID               string    `json:"id"`
	Source           string    `json:"source"`
	ProxyVersion     string    `json:"proxy_version"`
	CaptureVersion   string    `json:"capture_version"`
	RequestedModel   string    `json:"requested_model,omitempty"`
	ReportedModels   []string  `json:"reported_models,omitempty"`
	ResolvedModel    string    `json:"resolved_model,omitempty"`
	ResolvedProvider string    `json:"resolved_provider,omitempty"`
	ModelProvenance  string    `json:"model_provenance"`
	Started          time.Time `json:"started"`
	DurationNS       int64     `json:"duration_ns"`
	Method           string    `json:"method"`
	Path             string    `json:"path"`
	Client           string    `json:"client"`
	Status           int       `json:"status"`
	RequestType      string    `json:"request_content_type"`
	ResponseType     string    `json:"response_content_type"`
	Request          []byte    `json:"request"`
	Response         []byte    `json:"response"`
	RequestSHA256    string    `json:"request_sha256"`
	ResponseSHA256   string    `json:"response_sha256"`
	ResponseChunks   []int     `json:"response_chunks,omitempty"`
	Complete         bool      `json:"capture_complete"`
	Reason           string    `json:"incomplete_reason,omitempty"`
	Canceled         bool      `json:"canceled"`
	Scrubber         string    `json:"scrubber"`
	ScrubCount       int       `json:"scrub_count"`
}

type Manifest struct {
	Schema  int    `json:"schema"`
	ID      string `json:"id"`
	SHA256  string `json:"sha256"`
	Bytes   int64  `json:"bytes"`
	Records int64  `json:"records"`
}
