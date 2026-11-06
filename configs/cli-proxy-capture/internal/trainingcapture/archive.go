package trainingcapture

import (
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

func validateManifest(m Manifest) error {
	if err := validateID(m.ID); err != nil {
		return err
	}
	if m.Schema != 1 || m.Bytes <= 0 || m.Bytes > 256<<20 || m.Records <= 0 || len(m.SHA256) != 64 {
		return errors.New("invalid manifest")
	}
	_, err := hex.DecodeString(m.SHA256)
	return err
}
func verifySegment(path string, m Manifest) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() != m.Bytes {
		return errors.New("archive size/type mismatch")
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return err
	}
	if hex.EncodeToString(h.Sum(nil)) != m.SHA256 {
		return errors.New("archive hash mismatch")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	reader := bufio.NewReader(io.LimitReader(gz, 512<<20+1))
	var count, total int64
	for {
		b, e := reader.ReadBytes('\n')
		total += int64(len(b))
		if total > 512<<20 {
			return errors.New("archive expands beyond limit")
		}
		if len(b) > 0 {
			if len(b) > 192<<20 || b[len(b)-1] != '\n' {
				return errors.New("invalid record framing")
			}
			var r Record
			if err = json.Unmarshal(b, &r); err != nil || r.Schema != 1 || validateID(r.ID) != nil {
				return errors.New("invalid capture record")
			}
			count++
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return e
		}
	}
	if count != m.Records {
		return errors.New("archive record count mismatch")
	}
	return nil
}
func writePrivateJSON(path string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	f, err := exclusiveFile(path)
	if err != nil {
		return err
	}
	n, err := f.Write(b)
	if err == nil && n != len(b) {
		err = io.ErrShortWrite
	}
	if err == nil {
		err = f.Sync()
	}
	if e := f.Close(); err == nil {
		err = e
	}
	return err
}

// Receive returns a receipt only after verified data and manifest are durable.
// Existing matching segments are reverified after lost acknowledgements.
func Receive(root string, m Manifest, src io.Reader) (Manifest, error) {
	var zero Manifest
	if err := validateManifest(m); err != nil {
		return zero, err
	}
	if err := PrivateDir(root); err != nil {
		return zero, err
	}
	dir := filepath.Join(root, m.ID[:2])
	if err := PrivateDir(dir); err != nil {
		return zero, err
	}
	lock, err := os.OpenFile(filepath.Join(dir, m.ID+".lock"), os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return zero, err
	}
	defer lock.Close()
	if err = lock.Chmod(0600); err != nil {
		return zero, err
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return zero, err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	final := filepath.Join(dir, m.ID+".jsonl.gz")
	manifest := filepath.Join(dir, m.ID+".manifest.json")
	if existing, e := loadManifest(manifest); e == nil {
		if existing != m {
			return zero, errors.New("archive manifest conflict")
		}
	} else if !os.IsNotExist(e) {
		return zero, e
	}
	if _, err = os.Lstat(final); err == nil {
		// Drain sender input before returning a receipt; avoids broken-pipe races.
		if _, err = io.Copy(io.Discard, io.LimitReader(src, m.Bytes+1)); err != nil {
			return zero, err
		}
		if err = verifySegment(final, m); err != nil {
			return zero, err
		}
		if err = os.Chmod(final, 0600); err != nil {
			return zero, err
		}
	} else {
		if !os.IsNotExist(err) {
			return zero, err
		}
		temp := filepath.Join(dir, m.ID+"."+randomID()+".part")
		f, e := exclusiveFile(temp)
		if e != nil {
			return zero, e
		}
		defer os.Remove(temp)
		n, e := io.Copy(f, io.LimitReader(src, m.Bytes+1))
		if e == nil && n != m.Bytes {
			e = errors.New("upload length mismatch")
		}
		if e == nil {
			e = f.Sync()
		}
		if e2 := f.Close(); e == nil {
			e = e2
		}
		if e != nil {
			return zero, e
		}
		if e = verifySegment(temp, m); e != nil {
			return zero, e
		}
		if e = os.Rename(temp, final); e != nil {
			return zero, e
		}
	}
	if existing, e := loadManifest(manifest); e == nil {
		if existing != m {
			return zero, errors.New("archive manifest conflict")
		}
		if e = os.Chmod(manifest, 0600); e != nil {
			return zero, e
		}
	} else {
		if !os.IsNotExist(e) {
			return zero, e
		}
		temp := manifest + "." + randomID() + ".part"
		defer os.Remove(temp)
		if e = writePrivateJSON(temp, m); e != nil {
			return zero, e
		}
		if e = os.Rename(temp, manifest); e != nil {
			return zero, e
		}
	}
	if err = syncDir(dir); err != nil {
		return zero, err
	}
	if err = syncDir(root); err != nil {
		return zero, err
	}
	return m, nil
}

type Transfer func(context.Context, Manifest, io.Reader) (Manifest, error)

// Ship preserves the original acknowledged-source cleanup behavior.
func Ship(ctx context.Context, root string, transfer Transfer) error {
	return ShipWithOptions(ctx, root, transfer, ShipOptions{})
}

type ShipOptions struct {
	RetainSource bool
}

func ShipWithOptions(ctx context.Context, root string, transfer Transfer, options ShipOptions) error {
	if err := PrivateDir(root); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(root, "ship.lock"), os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = lock.Chmod(0600); err != nil {
		return err
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return errors.New("shipper already active")
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	dir := filepath.Join(root, "sealed")
	if err = PrivateDir(dir); err != nil {
		return err
	}
	files, err := filepath.Glob(filepath.Join(dir, "*.manifest.json"))
	if err != nil {
		return err
	}
	for _, path := range files {
		if err = ctx.Err(); err != nil {
			return err
		}
		info, e := os.Lstat(path)
		if e != nil || !info.Mode().IsRegular() {
			return errors.New("unsafe manifest")
		}
		m, e := loadManifest(path)
		if e != nil {
			return e
		}
		if filepath.Base(path) != m.ID+".manifest.json" {
			return errors.New("manifest ID mismatch")
		}
		segment := filepath.Join(dir, m.ID+".jsonl.gz")
		if e = verifySegment(segment, m); e != nil {
			return e
		}
		if prior, e := loadManifest(filepath.Join(root, "receipts", m.ID+".json")); e == nil {
			if prior != m {
				return errors.New("local receipt ID conflict")
			}
			if options.RetainSource {
				continue
			}
		} else if !os.IsNotExist(e) {
			return e
		}
		f, e := os.Open(segment)
		if e != nil {
			return e
		}
		receipt, e := transfer(ctx, m, f)
		f.Close()
		if e != nil {
			return e
		}
		if receipt != m {
			return errors.New("receipt mismatch; retaining source")
		}
		// Immutable source must still match immediately before destructive cleanup.
		if e = verifySegment(segment, m); e != nil {
			return e
		}
		manifestInfo, e := os.Stat(path)
		if e != nil {
			return e
		}
		receiptDir := filepath.Join(root, "receipts")
		if e = PrivateDir(receiptDir); e != nil {
			return e
		}
		receiptPath := filepath.Join(receiptDir, m.ID+".json")
		if previous, e := loadManifest(receiptPath); e == nil {
			if previous != m {
				return errors.New("local receipt conflict")
			}
		} else {
			if !os.IsNotExist(e) {
				return e
			}
			if e = writePrivateJSON(receiptPath, m); e != nil {
				return e
			}
		}
		if e = syncDir(receiptDir); e != nil {
			return e
		}
		if options.RetainSource {
			continue
		}
		// Remove manifest first: a crash may leave an orphan segment, never an
		// upload candidate whose data was deleted without a durable local receipt.
		if e = os.Remove(path); e != nil {
			return e
		}
		if e = syncDir(dir); e != nil {
			return e
		}
		if e = os.Remove(segment); e != nil {
			return e
		}
		if e = syncDir(dir); e != nil {
			return e
		}
		if e = addReclaimed(root, uint64(m.Bytes+manifestInfo.Size())); e != nil {
			return e
		}
		// Retain the durable local receipt; pruning requires an explicit policy.
	}
	return nil
}

// ReadUpload parses a bounded JSON manifest line; subsequent bytes are gzip data.
func ReadUpload(root string, r io.Reader) (Manifest, error) {
	reader := bufio.NewReaderSize(r, 4096)
	line, err := reader.ReadSlice('\n')
	if err != nil {
		return Manifest{}, errors.New("invalid upload manifest framing")
	}
	var m Manifest
	if err = json.Unmarshal(line, &m); err != nil {
		return Manifest{}, errors.New("invalid upload manifest")
	}
	return Receive(root, m, reader)
}
func WriteUpload(w io.Writer, m Manifest, r io.Reader) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if _, err = fmt.Fprintln(w, strings.TrimSpace(string(b))); err != nil {
		return err
	}
	_, err = io.Copy(w, r)
	return err
}

// A single fixed-size counter avoids scanning backlog directories per capture.
// Publish reclamation only after deletion is durable. A crash before publication
// temporarily overcounts usage (safe); writer restart reconciles actual files.
func readReclaimed(root string) (uint64, error) {
	path := filepath.Join(root, "reclaimed.json")
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64 {
		return 0, errors.New("unsafe reclamation counter")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	var n uint64
	err = json.Unmarshal(b, &n)
	return n, err
}
func addReclaimed(root string, bytes uint64) error {
	n, err := readReclaimed(root)
	if err != nil {
		return err
	}
	if n+bytes < n {
		return errors.New("reclamation counter overflow")
	}
	path := filepath.Join(root, "reclaimed.json")
	temp := path + "." + randomID() + ".part"
	defer os.Remove(temp)
	if err = writePrivateJSON(temp, n+bytes); err != nil {
		return err
	}
	if err = os.Rename(temp, path); err != nil {
		return err
	}
	return syncDir(root)
}
