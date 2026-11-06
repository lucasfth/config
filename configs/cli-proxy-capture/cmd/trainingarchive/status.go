package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/lucasfth/config/configs/cli-proxy-capture/internal/trainingcapture"
)

type shipStatus struct {
	Started      time.Time `json:"started"`
	Finished     time.Time `json:"finished"`
	Success      bool      `json:"success"`
	RetainSource bool      `json:"retain_source"`
	Shipped      int       `json:"shipped_segments_this_run"`
}

// A fixed-size private heartbeat avoids unbounded success logs. Receipts remain
// the durable per-segment evidence; a heartbeat alone does not prove delivery.
func writeShipStatus(root string, status shipStatus) error {
	if err := trainingcapture.PrivateDir(root); err != nil {
		return err
	}
	f, err := os.CreateTemp(root, ".ship-status.*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err = json.NewEncoder(f).Encode(status); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), filepath.Join(root, "ship-status.json")); err != nil {
		return err
	}
	dir, err := os.Open(root)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
