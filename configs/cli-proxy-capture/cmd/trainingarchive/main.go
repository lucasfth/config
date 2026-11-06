package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"

	"github.com/lucasfth/config/configs/cli-proxy-capture/internal/trainingcapture"
)

var safeTarget = regexp.MustCompile(`^[A-Za-z0-9_.@-]+$`)
var safePath = regexp.MustCompile(`^/[A-Za-z0-9_./-]+$`)

type boundedOutput struct {
	bytes.Buffer
	limit int
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	if len(p) > b.limit-b.Len() {
		return 0, errors.New("receiver output limit exceeded")
	}
	return b.Buffer.Write(p)
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: trainingarchive receive|ship [flags]")
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	root := flags.String("root", "", "private local spool (ship) or archive (receive)")
	target := flags.String("target", "", "SSH host alias, optionally user@host")
	receiver := flags.String("receiver", "", "absolute receiver executable on Freyr")
	archive := flags.String("archive", "", "absolute private archive directory on Freyr")
	identity := flags.String("identity", "", "dedicated SSH identity file")
	hosts := flags.String("known-hosts", "", "pinned known_hosts file")
	timeout := flags.Duration("timeout", 10*time.Minute, "maximum shipping run duration")
	retainSource := flags.Bool("retain-source", true, "keep acknowledged local segments; false explicitly enables deletion")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	if *root == "" {
		return errors.New("--root required")
	}
	switch args[0] {
	case "receive":
		m, err := trainingcapture.ReadUpload(*root, os.Stdin)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(m)
	case "ship":
		if !safeTarget.MatchString(*target) || (*target)[0] == '-' || !safePath.MatchString(*receiver) || !safePath.MatchString(*archive) || filepath.Clean(*receiver) != *receiver || filepath.Clean(*archive) != *archive || *identity == "" || *hosts == "" {
			return errors.New("ship requires safe target/absolute receiver/archive and explicit identity/known-hosts")
		}
		if *timeout <= 0 {
			return errors.New("positive timeout required")
		}
		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		defer cancel()
		started := time.Now().UTC()
		shipped := 0
		err := trainingcapture.ShipWithOptions(ctx, *root, func(ctx context.Context, m trainingcapture.Manifest, r io.Reader) (trainingcapture.Manifest, error) {
			cmd := exec.CommandContext(ctx, "ssh", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", "-o", "UserKnownHostsFile="+*hosts, "-i", *identity, *target, *receiver+" receive --root "+*archive)
			cmd.WaitDelay = 5 * time.Second
			stdout := &boundedOutput{limit: 8192}
			stderr := &boundedOutput{limit: 8192}
			cmd.Stdout = stdout
			cmd.Stderr = stderr
			pipe, err := cmd.StdinPipe()
			if err != nil {
				return trainingcapture.Manifest{}, err
			}
			if err = cmd.Start(); err != nil {
				return trainingcapture.Manifest{}, errors.New("SSH receiver start failed")
			}
			writeErr := trainingcapture.WriteUpload(pipe, m, r)
			closeErr := pipe.Close()
			waitErr := cmd.Wait()
			if writeErr != nil || closeErr != nil || waitErr != nil {
				return trainingcapture.Manifest{}, errors.New("SSH transfer failed; source retained")
			}
			var receipt trainingcapture.Manifest
			decoder := json.NewDecoder(bytes.NewReader(stdout.Bytes()))
			if err = decoder.Decode(&receipt); err != nil {
				return receipt, errors.New("invalid receiver receipt")
			}
			var extra any
			if err = decoder.Decode(&extra); err != io.EOF {
				return receipt, errors.New("extra receiver output")
			}
			if receipt == m {
				shipped++
			}
			return receipt, nil
		}, trainingcapture.ShipOptions{RetainSource: *retainSource})
		statusErr := writeShipStatus(*root, shipStatus{Started: started, Finished: time.Now().UTC(), Success: err == nil, RetainSource: *retainSource, Shipped: shipped})
		if err != nil {
			return err
		}
		return statusErr
	default:
		return errors.New("unknown command; use receive or ship")
	}
}
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
