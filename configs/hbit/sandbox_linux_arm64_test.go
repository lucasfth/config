//go:build linux && arm64

package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// A subprocess keeps the irreversible filter away from the test runner.
func TestSandbox(t *testing.T) {
	if os.Getenv("HBIT_SANDBOX_CHILD") != "1" {
		cmd := exec.Command(os.Args[0], "-test.run=^TestSandbox$", "-test.v")
		cmd.Env = append(os.Environ(), "HBIT_SANDBOX_CHILD=1")
		out, err := cmd.CombinedOutput()
		if err != nil || !strings.Contains(string(out), "SANDBOX_PASS") {
			t.Fatalf("sandbox child: %v\n%s", err, out)
		}
		t.Log(string(out))
		return
	}
	if err := restrictProcess(); err != nil {
		t.Fatal(err)
	}
	status, err := os.ReadFile("/proc/self/status")
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"NoNewPrivs:\t1", "Seccomp:\t2"} {
		if !strings.Contains(string(status), field) {
			t.Fatalf("missing %s", field)
		}
	}
	for _, target := range []string{"127.0.0.1:22", "192.168.86.51:22", "192.168.86.1:443", "1.1.1.1:443", "[::1]:22", "[2606:4700:4700::1111]:443"} {
		c, err := net.DialTimeout("tcp", target, time.Second)
		if c != nil {
			c.Close()
		}
		if !errors.Is(err, syscall.EPERM) {
			t.Fatalf("connect %s must fail EPERM, got %v", target, err)
		}
		t.Logf("connect %s: EPERM", target)
	}
	fd, err := unix.Socket(unix.AF_INET, unix.SOCK_DGRAM, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer unix.Close(fd)
	if err := unix.Sendto(fd, []byte("blocked"), 0, &unix.SockaddrInet4{Port: 53, Addr: [4]byte{1, 1, 1, 1}}); !errors.Is(err, syscall.EPERM) {
		t.Fatalf("UDP sendto must fail EPERM, got %v", err)
	}
	for _, nr := range []uintptr{unix.SYS_EXECVE, unix.SYS_EXECVEAT, unix.SYS_SENDMSG, unix.SYS_SENDMMSG, unix.SYS_IO_URING_SETUP, unix.SYS_PTRACE, unix.SYS_PROCESS_VM_WRITEV, unix.SYS_MOUNT, unix.SYS_UNSHARE, unix.SYS_SETNS, unix.SYS_BPF} {
		_, _, err := unix.Syscall6(nr, 0, 0, 0, 0, 0, 0)
		if err != syscall.EPERM {
			t.Fatalf("syscall %d: want EPERM, got %v", nr, err)
		}
	}
	// Listening still works. The SSH integration tests cover accepted connections.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	listener.Close()
	fmt.Println("SANDBOX_PASS: IPv4/IPv6 connect, UDP, exec, kernel escape helpers blocked; listener allowed")
}
