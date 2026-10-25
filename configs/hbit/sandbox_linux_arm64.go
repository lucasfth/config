//go:build linux && arm64

package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/unix"
)

// Install on every Go thread before serving. Accepted sockets can still read and
// write; creating outbound connections, executing programs and kernel control
// interfaces are unnecessary for this menu. This is defense in depth, not a
// claim that a denylist replaces the VM or network boundary.
func restrictProcess() error {
	filter := []unix.SockFilter{
		{Code: unix.BPF_LD | unix.BPF_W | unix.BPF_ABS, K: 4}, // seccomp_data.arch
		{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: unix.AUDIT_ARCH_AARCH64, Jt: 1},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_KILL_PROCESS},
		{Code: unix.BPF_LD | unix.BPF_W | unix.BPF_ABS, K: 0}, // seccomp_data.nr
	}
	for _, nr := range []uint32{
		unix.SYS_CONNECT, unix.SYS_SENDTO, unix.SYS_SENDMSG, unix.SYS_SENDMMSG,
		unix.SYS_EXECVE, unix.SYS_EXECVEAT,
		unix.SYS_IO_URING_SETUP, unix.SYS_PTRACE,
		unix.SYS_PROCESS_VM_READV, unix.SYS_PROCESS_VM_WRITEV,
		unix.SYS_MOUNT, unix.SYS_UMOUNT2, unix.SYS_PIVOT_ROOT,
		unix.SYS_UNSHARE, unix.SYS_SETNS, unix.SYS_BPF,
		unix.SYS_KEXEC_LOAD, unix.SYS_KEXEC_FILE_LOAD,
		unix.SYS_INIT_MODULE, unix.SYS_FINIT_MODULE, unix.SYS_DELETE_MODULE,
		unix.SYS_OPEN_BY_HANDLE_AT, unix.SYS_PERF_EVENT_OPEN,
	} {
		filter = append(filter,
			unix.SockFilter{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: nr, Jf: 1},
			unix.SockFilter{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM)},
		)
	}
	filter = append(filter, unix.SockFilter{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ALLOW})
	if err := unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0); err != nil {
		return fmt.Errorf("no-new-privileges: %w", err)
	}
	program := unix.SockFprog{Len: uint16(len(filter)), Filter: &filter[0]}
	result, _, errno := unix.Syscall(unix.SYS_SECCOMP, unix.SECCOMP_SET_MODE_FILTER, unix.SECCOMP_FILTER_FLAG_TSYNC, uintptr(unsafe.Pointer(&program)))
	if errno != 0 {
		return fmt.Errorf("seccomp TSYNC: %w", errno)
	}
	if result != 0 {
		return fmt.Errorf("seccomp TSYNC refused thread %d", result)
	}
	return nil
}
