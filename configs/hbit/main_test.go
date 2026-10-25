package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	ssh "golang.org/x/crypto/ssh"
)

func testSigner(t *testing.T) ssh.Signer {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func TestSSHBoundary(t *testing.T) {
	host, allowed := testSigner(t), testSigner(t)
	server, err := newServer("127.0.0.1:0", host, []ssh.PublicKey{allowed.PublicKey()})
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	dial := func(auth []ssh.AuthMethod) (*ssh.Client, error) {
		return ssh.Dial("tcp", listener.Addr().String(), &ssh.ClientConfig{
			User: "hbit", Auth: auth, HostKeyCallback: ssh.FixedHostKey(host.PublicKey()), Timeout: 3 * time.Second,
		})
	}
	for name, auth := range map[string][]ssh.AuthMethod{
		"none":        nil,
		"unknown key": {ssh.PublicKeys(testSigner(t))},
		"password":    {ssh.Password("hbit")},
	} {
		t.Run(name, func(t *testing.T) {
			client, err := dial(auth)
			if err == nil {
				client.Close()
				t.Fatal("unauthorized connection accepted")
			}
		})
	}
	client, err := dial([]ssh.AuthMethod{ssh.PublicKeys(allowed)})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	for _, command := range []string{"id", "", "uname -a"} {
		t.Run("exec "+command, func(t *testing.T) {
			s, err := client.NewSession()
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			if err := s.Run(command); err == nil {
				t.Fatal("exec accepted")
			}
		})
	}
	t.Run("no PTY", func(t *testing.T) {
		s, err := client.NewSession()
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		if err := s.Shell(); err == nil {
			if err := s.Wait(); err == nil {
				t.Fatal("shell without PTY accepted")
			}
		}
	})
	t.Run("SFTP", func(t *testing.T) {
		s, err := client.NewSession()
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		if err := s.RequestSubsystem("sftp"); err == nil {
			t.Fatal("SFTP accepted")
		}
	})
	t.Run("local forwarding", func(t *testing.T) {
		c, err := client.Dial("tcp", "127.0.0.1:22")
		if err == nil {
			c.Close()
			t.Fatal("forwarding accepted")
		}
	})
	t.Run("remote forwarding", func(t *testing.T) {
		l, err := client.Listen("tcp", "127.0.0.1:0")
		if err == nil {
			l.Close()
			t.Fatal("remote forwarding accepted")
		}
	})
	t.Run("agent forwarding", func(t *testing.T) {
		s, err := client.NewSession()
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		ok, err := s.SendRequest("auth-agent-req@openssh.com", true, nil)
		if err == nil && ok {
			t.Fatal("agent forwarding accepted")
		}
	})
	t.Run("PTY welcome menu", func(t *testing.T) {
		s, err := client.NewSession()
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		if err := s.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{}); err != nil {
			t.Fatal(err)
		}
		s.Stdin = strings.NewReader("1\r2\r3\rq\r")
		var out bytes.Buffer
		s.Stdout = &out
		s.Stderr = io.Discard
		if err := s.Shell(); err != nil {
			t.Fatal(err)
		}
		if err := s.Wait(); err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"hbit.sh", "Projects", "Nothing published yet", "Lucas Hanson", "not a shell", "Goodbye"} {
			if !strings.Contains(out.String(), want) {
				t.Errorf("missing %q in %q", want, out.String())
			}
		}
	})
}

func TestEmptyAllowlistRejected(t *testing.T) {
	if _, err := newServer("127.0.0.1:0", testSigner(t), nil); err == nil {
		t.Fatal("empty allowlist accepted")
	}
}
