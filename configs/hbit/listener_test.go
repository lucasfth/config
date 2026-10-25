package main

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestPrivateUnixListener(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ssh.sock")
	listener, err := listenSSH("unix:" + path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("socket mode %o", info.Mode().Perm())
	}
	connection, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	connection.Close()
	if _, err := listenSSH("unix:" + path); err == nil {
		t.Fatal("must not replace an existing socket")
	}
}
