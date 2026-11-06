package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lucasfth/config/configs/cli-proxy-capture/internal/trainingcapture"
)

func TestArchiveCommandRoundTripAndFailureRetention(t *testing.T) {
	dir := t.TempDir()
	binary := filepath.Join(dir, "trainingarchive")
	cmd := exec.Command("go", "build", "-o", binary, ".")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, output)
	}
	spool := filepath.Join(dir, "spool")
	sealed := filepath.Join(spool, "sealed")
	if err := os.MkdirAll(sealed, 0700); err != nil {
		t.Fatal(err)
	}
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	record := trainingcapture.Record{Schema: 1, ID: strings.Repeat("a", 32), Source: "fixture", Request: []byte(`{}`)}
	if err := json.NewEncoder(gz).Encode(record); err != nil {
		t.Fatal(err)
	}
	gz.Close()
	data := compressed.Bytes()
	hash := sha256.Sum256(data)
	m := trainingcapture.Manifest{Schema: 1, ID: strings.Repeat("b", 32), SHA256: hex.EncodeToString(hash[:]), Bytes: int64(len(data)), Records: 1}
	manifest, _ := json.Marshal(m)
	segment := filepath.Join(sealed, m.ID+".jsonl.gz")
	manifestPath := filepath.Join(sealed, m.ID+".manifest.json")
	writeSource := func() {
		t.Helper()
		if err := os.WriteFile(segment, data, 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(manifestPath, manifest, 0600); err != nil {
			t.Fatal(err)
		}
	}
	writeSource()
	archive := filepath.Join(dir, "archive")
	upload := append(append([]byte(nil), manifest...), '\n')
	upload = append(upload, data...)
	receive := exec.Command(binary, "receive", "--root", archive)
	receive.Stdin = bytes.NewReader(upload)
	out, err := receive.CombinedOutput()
	if err != nil {
		t.Fatalf("receive: %v %s", err, out)
	}
	var receipt trainingcapture.Manifest
	if err = json.Unmarshal(out, &receipt); err != nil || receipt != m {
		t.Fatalf("receipt: %v", err)
	}
	// Replace only the SSH transport boundary with an executable that launches
	// the real receiver, so CLI framing/receipt/deletion are actually exercised.
	fakeBin := filepath.Join(dir, "bin")
	os.Mkdir(fakeBin, 0700)
	fakeSSH := filepath.Join(fakeBin, "ssh")
	script := "#!/bin/sh\nif [ \"$FAIL_CAPTURE_TRANSFER\" = 1 ]; then exit 42; fi\nexec \"$CAPTURE_TEST_BINARY\" receive --root \"$CAPTURE_TEST_ARCHIVE\"\n"
	if err = os.WriteFile(fakeSSH, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	args := []string{"ship", "--root", spool, "--target", "fixture", "--receiver", "/private/trainingarchive", "--archive", "/private/archive", "--identity", filepath.Join(dir, "identity"), "--known-hosts", filepath.Join(dir, "hosts")}
	// Retention is an explicit CLI contract: repeat runs preserve both sources
	// and the durable receipt without sending the same segment again.
	for i := 0; i < 2; i++ {
		command := exec.Command(binary, append(append([]string(nil), args...), "--retain-source")...)
		command.Env = append(os.Environ(), "PATH="+fakeBin+":"+os.Getenv("PATH"), "CAPTURE_TEST_BINARY="+binary, "CAPTURE_TEST_ARCHIVE="+archive)
		if output, e := command.CombinedOutput(); e != nil {
			t.Fatalf("retain ship: %v %s", e, output)
		}
		for _, p := range []string{segment, manifestPath, filepath.Join(spool, "receipts", m.ID+".json")} {
			if _, e := os.Stat(p); e != nil {
				t.Fatal("retained file missing", e)
			}
		}
	}
	// Default CLI mode is also retention; cleanup must be explicitly selected.
	retained := exec.Command(binary, args...)
	retained.Env = append(os.Environ(), "PATH="+fakeBin+":"+os.Getenv("PATH"), "CAPTURE_TEST_BINARY="+binary, "CAPTURE_TEST_ARCHIVE="+archive)
	if output, e := retained.CombinedOutput(); e != nil {
		t.Fatalf("default ship: %v %s", e, output)
	}
	if _, e := os.Stat(segment); e != nil {
		t.Fatal("default CLI deleted source")
	}
	args = append(args, "--retain-source=false")
	for _, fail := range []bool{true, false} {
		command := exec.Command(binary, args...)
		env := append(os.Environ(), "PATH="+fakeBin+":"+os.Getenv("PATH"), "CAPTURE_TEST_BINARY="+binary, "CAPTURE_TEST_ARCHIVE="+archive)
		if fail {
			env = append(env, "FAIL_CAPTURE_TRANSFER=1")
		}
		command.Env = env
		output, e := command.CombinedOutput()
		if fail {
			if e == nil {
				t.Fatal("failed transfer returned success")
			}
			if _, e = os.Stat(segment); e != nil {
				t.Fatal("failed CLI transfer removed source")
			}
		} else {
			if e != nil {
				t.Fatalf("ship: %v %s", e, output)
			}
			if _, e = os.Stat(segment); !os.IsNotExist(e) {
				t.Fatal("successful CLI transfer retained source")
			}
		}
	}
	bad := exec.Command(binary, "receive", "--root", archive)
	bad.Stdin = strings.NewReader("not json\n")
	if err = bad.Run(); err == nil {
		t.Fatal("malformed upload accepted")
	}
}

func TestCommandRejectsUnsafeArguments(t *testing.T) {
	for _, args := range [][]string{nil, {"unknown", "--root", "/tmp/fixture"}, {"ship", "--root", "/tmp/fixture", "--target", "-oProxyCommand=bad"}, {"ship", "--root", "/tmp/fixture", "--target", "host", "--receiver", "/a;bad", "--archive", "/archive", "--identity", "/identity", "--known-hosts", "/hosts"}} {
		if err := run(args); err == nil {
			t.Fatalf("accepted %+v", args)
		}
	}
}
