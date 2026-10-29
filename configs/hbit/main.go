package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	charmssh "github.com/charmbracelet/ssh"
	ssh "golang.org/x/crypto/ssh"
	"golang.org/x/term"
)

func newServer(address string, host ssh.Signer, allowed []ssh.PublicKey) (*charmssh.Server, error) {
	if host == nil || len(allowed) == 0 {
		return nil, errors.New("host key and nonempty public-key allowlist required")
	}
	server := &charmssh.Server{
		Addr:        address,
		HostSigners: []charmssh.Signer{host},
		PublicKeyHandler: func(ctx charmssh.Context, key charmssh.PublicKey) bool {
			if ctx.User() != "hbit" {
				return false
			}
			for _, candidate := range allowed {
				if bytes.Equal(key.Marshal(), candidate.Marshal()) {
					return true
				}
			}
			return false
		},
		IdleTimeout: 15 * time.Minute,
		MaxTimeout:  time.Hour,
	}
	server.Handler = menu
	server.SessionRequestCallback = func(s charmssh.Session, request string) bool {
		_, _, pty := s.Pty()
		return request == "shell" && pty
	}
	server.ChannelHandlers = map[string]charmssh.ChannelHandler{"session": restrictedSession}
	server.RequestHandlers = map[string]charmssh.RequestHandler{}
	server.SubsystemHandlers = map[string]charmssh.SubsystemHandler{}
	return server, nil
}

// Filter agent requests before they reach Charm SSH's session layer, which otherwise
// acknowledges them; forwarding and agent handlers stay disabled.
type filteredChannel struct {
	ssh.NewChannel
	ctx context.Context
}

func (c filteredChannel) Accept() (ssh.Channel, <-chan *ssh.Request, error) {
	channel, requests, err := c.NewChannel.Accept()
	if err != nil {
		return nil, nil, err
	}
	filtered := make(chan *ssh.Request)
	go func() {
		defer close(filtered)
		for request := range requests {
			if request.Type == "auth-agent-req@openssh.com" {
				_ = request.Reply(false, nil)
				continue
			}
			select {
			case filtered <- request:
			case <-c.ctx.Done():
				return
			}
		}
	}()
	return channel, filtered, nil
}

func restrictedSession(server *charmssh.Server, conn *ssh.ServerConn, channel ssh.NewChannel, ctx charmssh.Context) {
	charmssh.DefaultSessionHandler(server, conn, filteredChannel{channel, ctx}, ctx)
}

func menu(session charmssh.Session) {
	terminal := term.NewTerminal(session, "> ")
	pty, changes, _ := session.Pty()
	_ = terminal.SetSize(pty.Window.Width, pty.Window.Height)
	go func() {
		for {
			select {
			case window, ok := <-changes:
				if !ok {
					return
				}
				_ = terminal.SetSize(window.Width, window.Height)
			case <-session.Context().Done():
				return
			}
		}
	}()
	if _, err := fmt.Fprint(terminal, menuBanner()); err != nil {
		return
	}
	for {
		line, err := terminal.ReadLine()
		if err != nil {
			return
		}
		message, quit := menuCommand(line)
		if _, err := fmt.Fprint(terminal, message+"\r\n"); err != nil {
			return
		}
		if quit {
			return
		}
	}
}

func loadAllowed(path string) ([]ssh.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var keys []ssh.PublicKey
	for _, line := range bytes.Split(data, []byte{'\n'}) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 || line[0] == '#' {
			continue
		}
		key, _, options, _, err := ssh.ParseAuthorizedKey(line)
		if err != nil {
			return nil, fmt.Errorf("invalid allowlist key: %w", err)
		}
		if len(options) != 0 {
			return nil, errors.New("allowlist must contain bare public keys, not authorized_keys options")
		}
		if _, certificate := key.(*ssh.Certificate); certificate {
			return nil, errors.New("allowlist requires raw public keys, not certificates")
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return nil, errors.New("empty public-key allowlist")
	}
	return keys, nil
}

func listenSSH(address string) (net.Listener, error) {
	if !strings.HasPrefix(address, "unix:") {
		return net.Listen("tcp", address)
	}
	listener, err := net.Listen("unix", strings.TrimPrefix(address, "unix:"))
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(strings.TrimPrefix(address, "unix:"), 0600); err != nil {
		listener.Close()
		return nil, err
	}
	return listener, nil
}

func run() error {
	address := flag.String("listen", ":2222", "SSH listen address (unix:path or TCP address)")
	hostPath := flag.String("host-key", "/keys/host_ed25519", "existing host private key")
	allowPath := flag.String("authorized-keys", "/keys/authorized_keys", "allowed raw public keys")
	flag.Parse()
	hostPEM, err := os.ReadFile(*hostPath)
	if err != nil {
		return err
	}
	host, err := ssh.ParsePrivateKey(hostPEM)
	if err != nil {
		return err
	}
	allowed, err := loadAllowed(*allowPath)
	if err != nil {
		return err
	}
	server, err := newServer(*address, host, allowed)
	if err != nil {
		return err
	}
	listener, err := listenSSH(*address)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := restrictProcess(); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() { <-ctx.Done(); _ = server.Close() }()
	log.Printf("hbit listening on %s; host key %s; %d allowed keys", *address, ssh.FingerprintSHA256(host.PublicKey()), len(allowed))
	err = server.Serve(listener)
	if errors.Is(err, charmssh.ErrServerClosed) {
		return nil
	}
	return err
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
