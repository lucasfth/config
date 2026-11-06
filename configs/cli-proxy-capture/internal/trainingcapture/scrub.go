package trainingcapture

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

const ScrubberVersion = "credentials-v1"
const marker = "[CREDENTIAL]"

var credentialPattern = regexp.MustCompile(`(?i)\bBearer[ \t]+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk-(?:proj-|ant-[A-Za-z0-9]+-)?|gsk_|xai-|AIza)[A-Za-z0-9_-]{16,}`)

type secretRange struct{ start, end int }

func ranges(s string, keys []string) []secretRange {
	var out []secretRange
	for _, m := range credentialPattern.FindAllStringIndex(s, -1) {
		out = append(out, secretRange{m[0], m[1]})
	}
	for _, key := range keys {
		if key == "" {
			continue
		}
		for from := 0; from < len(s); {
			at := strings.Index(s[from:], key)
			if at < 0 {
				break
			}
			at += from
			out = append(out, secretRange{at, at + len(key)})
			from = at + len(key)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].start < out[j].start })
	merged := out[:0]
	for _, r := range out {
		if len(merged) > 0 && r.start <= merged[len(merged)-1].end {
			if r.end > merged[len(merged)-1].end {
				merged[len(merged)-1].end = r.end
			}
			continue
		}
		merged = append(merged, r)
	}
	return merged
}

type stringPart struct {
	value string
	set   func(string)
}

func visitStrings(v any, path string, groups map[string][]stringPart) {
	switch x := v.(type) {
	case map[string]any:
		for k, child := range x {
			key := k
			p := path + "/" + key
			if s, ok := child.(string); ok {
				groups[p] = append(groups[p], stringPart{s, func(v string) { x[key] = v }})
			} else {
				visitStrings(child, p, groups)
			}
		}
	case []any:
		for i, child := range x {
			idx := i
			p := fmt.Sprintf("%s/%d", path, i)
			if s, ok := child.(string); ok {
				groups[p] = append(groups[p], stringPart{s, func(v string) { x[idx] = v }})
			} else {
				visitStrings(child, p, groups)
			}
		}
	}
}

func decodeJSON(b []byte) (any, error) {
	var v any
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&v); err != nil {
		return nil, err
	}
	if d.More() {
		return nil, errors.New("trailing JSON")
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return nil, errors.New("trailing JSON")
	}
	return v, nil
}

// Rewrite object keys after values, so value setters cannot recreate old keys.
func scrubObjectKeys(v any, keys []string) (int, error) {
	count := 0
	switch x := v.(type) {
	case map[string]any:
		for key, value := range x {
			n, err := scrubObjectKeys(value, keys)
			if err != nil {
				return count, err
			}
			count += n
			matches := ranges(key, keys)
			if len(matches) == 0 {
				continue
			}
			var clean strings.Builder
			pos := 0
			for _, r := range matches {
				clean.WriteString(key[pos:r.start])
				clean.WriteString(marker)
				pos = r.end
			}
			clean.WriteString(key[pos:])
			if _, exists := x[clean.String()]; exists {
				return count, errors.New("scrubbed object key collision")
			}
			delete(x, key)
			x[clean.String()] = value
			count += len(matches)
		}
	case []any:
		for _, value := range x {
			n, err := scrubObjectKeys(value, keys)
			if err != nil {
				return count, err
			}
			count += n
		}
	}
	return count, nil
}

// Scrub operates only on a capture copy. Unsupported bodies are never persisted.
// SSE string fragments sharing a JSON path are inspected together, so a key split
// across transport writes or model deltas cannot bypass the credential matcher.
func Scrub(body []byte, contentType string, keys []string) ([]byte, int, error) {
	if len(body) == 0 {
		return nil, 0, nil
	}
	groups := map[string][]stringPart{}
	type line struct {
		raw   string
		value any
		data  bool
	}
	var lines []line
	sse := strings.HasPrefix(strings.ToLower(contentType), "text/event-stream")
	if sse {
		for _, raw := range strings.Split(string(body), "\n") {
			l := line{raw: raw}
			if strings.HasPrefix(raw, "data:") {
				data := strings.TrimSpace(strings.TrimPrefix(raw, "data:"))
				if data != "[DONE]" && data != "" {
					v, err := decodeJSON([]byte(data))
					if err != nil {
						return nil, 0, errors.New("unsupported SSE payload")
					}
					l.value = v
					l.data = true
					visitStrings(v, "", groups)
				}
			} else if strings.HasPrefix(raw, ":") {
				l.raw = ":"
			} else if raw != "" && raw != "\r" && !strings.HasPrefix(raw, "event:") && !strings.HasPrefix(raw, "id:") && !strings.HasPrefix(raw, "retry:") {
				return nil, 0, errors.New("unsupported SSE framing")
			}
			// Event names and IDs can contain secrets too; omit non-data values rather than trust them.
			if strings.HasPrefix(raw, "id:") || strings.HasPrefix(raw, "retry:") {
				l.raw = ""
			}
			if strings.HasPrefix(raw, "event:") {
				l.raw = credentialPattern.ReplaceAllString(raw, marker)
				for _, k := range keys {
					if k != "" {
						l.raw = strings.ReplaceAll(l.raw, k, marker)
					}
				}
			}
			lines = append(lines, l)
		}
	} else {
		if !strings.Contains(strings.ToLower(contentType), "json") {
			return nil, 0, errors.New("unsupported content type")
		}
		v, err := decodeJSON(body)
		if err != nil {
			return nil, 0, errors.New("invalid JSON capture")
		}
		if _, ok := v.(map[string]any); !ok {
			return nil, 0, errors.New("unsupported JSON root")
		}
		lines = []line{{value: v, data: true}}
		visitStrings(v, "", groups)
	}
	count := 0
	for _, parts := range groups {
		var all strings.Builder
		for _, p := range parts {
			all.WriteString(p.value)
		}
		matches := ranges(all.String(), keys)
		count += len(matches)
		start := 0
		for _, p := range parts {
			end := start + len(p.value)
			pos := 0
			var out strings.Builder
			for _, r := range matches {
				if r.end <= start || r.start >= end {
					continue
				}
				a := max(r.start, start) - start
				b := min(r.end, end) - start
				out.WriteString(p.value[pos:a])
				out.WriteString(marker)
				pos = b
			}
			out.WriteString(p.value[pos:])
			p.set(out.String())
			start = end
		}
	}
	var out bytes.Buffer
	for i, l := range lines {
		if l.data {
			n, err := scrubObjectKeys(l.value, keys)
			if err != nil {
				return nil, 0, err
			}
			count += n
			b, err := json.Marshal(l.value)
			if err != nil {
				return nil, 0, err
			}
			if sse {
				out.WriteString("data: ")
			}
			out.Write(b)
		} else {
			out.WriteString(l.raw)
		}
		if sse && i < len(lines)-1 {
			out.WriteByte('\n')
		}
	}
	return out.Bytes(), count, nil
}
