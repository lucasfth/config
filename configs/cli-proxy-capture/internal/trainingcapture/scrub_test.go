package trainingcapture

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestScrubJSONAndSSE(t *testing.T) {
	key := "sk-proj-" + strings.Repeat("A", 32)
	body := []byte(`{"messages":[{"content":"Hi Æø — Bearer secret-token-123; ` + strings.Replace(key, "sk-", `\u0073k-`, 1) + `"}]}`)
	clean, count, err := Scrub(body, "application/json", nil)
	if err != nil || count != 2 || bytes.Contains(clean, []byte(key)) || bytes.Contains(clean, []byte("secret-token-123")) {
		t.Fatalf("scrub failed count=%d err=%v", count, err)
	}
	if !json.Valid(clean) || !bytes.Contains(clean, []byte("Hi Æø")) {
		t.Fatal("lost text or JSON")
	}
	sse := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"sk-proj-\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"" + strings.Repeat("A", 32) + "\"}}]}\n\ndata: [DONE]\n\n")
	clean, count, err = Scrub(sse, "text/event-stream", nil)
	if err != nil || count == 0 || bytes.Contains(clean, []byte(strings.Repeat("A", 32))) {
		t.Fatalf("split secret persisted count=%d err=%v", count, err)
	}
}

func TestScrubConfiguredKeyAndOpaqueBody(t *testing.T) {
	clean, n, err := Scrub([]byte(`{"text":"internal-custom-secret"}`), "application/json", []string{"internal-custom-secret"})
	if err != nil || n != 1 || bytes.Contains(clean, []byte("internal-custom-secret")) {
		t.Fatal("configured key not scrubbed")
	}
	if _, _, err = Scrub([]byte{0, 1, 2}, "application/octet-stream", nil); err == nil {
		t.Fatal("opaque body must not pass unsanitized")
	}
}

func TestScrubRejectsMalformedAndSanitizesObjectKeys(t *testing.T) {
	if _, _, err := Scrub([]byte(`{"ok":true} trailing`), "application/json", nil); err == nil {
		t.Fatal("accepted malformed trailing JSON")
	}
	key := "sk-proj-" + strings.Repeat("B", 32)
	clean, n, err := Scrub([]byte(`{"`+key+`":"ordinary"}`), "application/json", nil)
	if err != nil || n != 1 || bytes.Contains(clean, []byte(key)) {
		t.Fatalf("credential in JSON key persisted: count=%d err=%v", n, err)
	}
}
