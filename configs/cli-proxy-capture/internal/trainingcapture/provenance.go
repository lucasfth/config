package trainingcapture

import (
	"encoding/json"
	"strings"
)

func modelField(v map[string]any) string {
	if model, ok := v["model"].(string); ok {
		return model
	}
	if model, ok := v["modelVersion"].(string); ok {
		return model
	}
	return ""
}
func annotateModels(r *Record) {
	r.CaptureVersion = "training-capture-v1"
	r.ModelProvenance = "unknown"
	var request map[string]any
	if json.Unmarshal(r.Request, &request) == nil {
		r.RequestedModel = modelField(request)
	}
	add := func(v map[string]any) {
		model := modelField(v)
		if model == "" {
			for _, key := range []string{"message", "response"} {
				if nested, ok := v[key].(map[string]any); ok {
					model = modelField(nested)
					if model != "" {
						break
					}
				}
			}
		}
		if model == "" {
			return
		}
		for _, seen := range r.ReportedModels {
			if seen == model {
				return
			}
		}
		r.ReportedModels = append(r.ReportedModels, model)
		r.ModelProvenance = "response_reported"
	}
	if strings.HasPrefix(r.ResponseType, "text/event-stream") {
		for _, line := range strings.Split(string(r.Response), "\n") {
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			var v map[string]any
			if json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &v) == nil {
				add(v)
			}
		}
	} else {
		var v map[string]any
		if json.Unmarshal(r.Response, &v) == nil {
			add(v)
		}
	}
	// Response model fields are claims, not independently resolved provider IDs.
	// Resolution/attempt linkage must be supplied by a separately verified hook.
}
