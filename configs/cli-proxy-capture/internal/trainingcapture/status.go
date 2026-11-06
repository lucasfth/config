package trainingcapture

import (
	"os"
	"path/filepath"
	"time"
)

// WriteStatus publishes counters only; no prompts, model content or credentials.
func WriteStatus(root string, counters Counters) error {
	path := filepath.Join(root, "status.json")
	temp := path + "." + randomID() + ".part"
	defer os.Remove(temp)
	value := struct {
		Updated  time.Time `json:"updated"`
		Counters Counters  `json:"counters"`
	}{time.Now().UTC(), counters}
	if err := writePrivateJSON(temp, value); err != nil {
		return err
	}
	return os.Rename(temp, path)
}
