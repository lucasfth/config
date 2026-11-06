package trainingcapture

import (
	"compress/gzip"
	"crypto/rand"
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
	"time"
)

type SpoolConfig struct {
	Root                              string
	MaxBytes, FloorBytes, ResumeBytes uint64
	SegmentBytes                      int64
	Interval                          time.Duration
	Available                         func() (uint64, error)
	Now                               func() time.Time
	Rename                            func(string, string) error
	SyncDir                           func(string) error
}

type Spool struct {
	cfg                        SpoolConfig
	file                       *os.File
	gz                         *gzip.Writer
	id                         string
	count, raw                 int64
	opened                     time.Time
	paused                     bool
	lock                       *os.File
	used, available, reclaimed uint64
	checked                    time.Time
	reconciliations            int
	pending                    string
	publishFailures            uint64
}

func PrivateDir(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	// Check owned paths, not system ancestors (/var is a symlink on macOS).
	info, e := os.Lstat(abs)
	if e == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
		return errors.New("unsafe capture directory")
	}
	if e != nil && !os.IsNotExist(e) {
		return e
	}
	if err = os.MkdirAll(abs, 0700); err != nil {
		return err
	}
	return os.Chmod(abs, 0700)
}

func exclusiveFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
}
func syncDir(path string) error {
	f, e := os.Open(path)
	if e != nil {
		return e
	}
	defer f.Close()
	return f.Sync()
}
func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return ""
	}
	return hex.EncodeToString(b[:])
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

func NewSpool(cfg SpoolConfig) (*Spool, error) {
	if cfg.Root == "" {
		return nil, errors.New("capture root required")
	}
	if cfg.MaxBytes == 0 {
		cfg.MaxBytes = 100 << 30
	}
	if cfg.FloorBytes == 0 {
		cfg.FloorBytes = 50 << 30
	}
	if cfg.ResumeBytes == 0 {
		cfg.ResumeBytes = cfg.FloorBytes + 5<<30
	}
	if cfg.SegmentBytes == 0 {
		cfg.SegmentBytes = 64 << 20
	}
	if cfg.Interval == 0 {
		cfg.Interval = 5 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if err := PrivateDir(cfg.Root); err != nil {
		return nil, err
	}
	for _, name := range []string{"open", "sealed", "quarantine"} {
		if err := PrivateDir(filepath.Join(cfg.Root, name)); err != nil {
			return nil, err
		}
	}
	lockPath := filepath.Join(cfg.Root, "writer.lock")
	if info, e := os.Lstat(lockPath); e == nil && !info.Mode().IsRegular() {
		return nil, errors.New("unsafe lock")
	}
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	if err = lock.Chmod(0600); err != nil {
		lock.Close()
		return nil, err
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return nil, errors.New("capture writer already active")
	}
	if cfg.Available == nil {
		cfg.Available = func() (uint64, error) {
			var st syscall.Statfs_t
			e := syscall.Statfs(cfg.Root, &st)
			return uint64(st.Bavail) * uint64(st.Bsize), e
		}
	}
	s := &Spool{cfg: cfg, lock: lock}
	entries, err := os.ReadDir(filepath.Join(cfg.Root, "open"))
	if err != nil {
		s.Close()
		return nil, err
	}
	for _, e := range entries {
		if !e.Type().IsRegular() {
			s.Close()
			return nil, errors.New("unsafe open segment")
		}
		path := filepath.Join(cfg.Root, "open", e.Name())
		id := strings.TrimSuffix(e.Name(), ".part")
		if _, verifyErr := manifestForSegment(path, id); verifyErr == nil {
			s.id = id
			s.pending = path
			if err = s.Seal(); err != nil {
				_ = syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
				lock.Close()
				return nil, err
			}
			continue
		}
		if err = os.Rename(filepath.Join(cfg.Root, "open", e.Name()), filepath.Join(cfg.Root, "quarantine", randomID()+".part")); err != nil {
			s.Close()
			return nil, err
		}
	}
	s.used, err = s.usage()
	if err != nil {
		s.Close()
		return nil, err
	}
	s.reclaimed, err = readReclaimed(cfg.Root)
	if err != nil {
		s.Close()
		return nil, err
	}
	return s, nil
}

func (s *Spool) usage() (uint64, error) {
	s.reconciliations++
	var total uint64
	err := filepath.WalkDir(s.cfg.Root, func(path string, d os.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if d.Type()&os.ModeSymlink != 0 {
			return errors.New("capture symlink refused")
		}
		if path != s.cfg.Root && filepath.Dir(path) == s.cfg.Root {
			if d.IsDir() && d.Name() != "open" && d.Name() != "sealed" && d.Name() != "quarantine" {
				return filepath.SkipDir
			}
			if !d.IsDir() {
				return nil
			}
		}
		if d.IsDir() {
			return nil
		}
		info, e := d.Info()
		if e != nil {
			return e
		}
		if !info.Mode().IsRegular() {
			return errors.New("non-regular capture state")
		}
		total += uint64(info.Size())
		return nil
	})
	return total, err
}

func (s *Spool) admit(reserve uint64) error {
	now := s.cfg.Now()
	// statfs is constant-time and catches space consumed by other processes.
	// Only the fixed-size cross-process reclamation counter is sampled.
	available, err := s.cfg.Available()
	if err != nil {
		return err
	}
	s.available = available
	if s.checked.IsZero() || now.Sub(s.checked) >= time.Second {
		reclaimed, err := readReclaimed(s.cfg.Root)
		if err != nil {
			return err
		}
		if reclaimed < s.reclaimed {
			return errors.New("reclamation counter regressed")
		}
		delta := reclaimed - s.reclaimed
		if delta > s.used {
			if err = s.Reconcile(); err != nil {
				return err
			}
		} else {
			s.used -= delta
			s.reclaimed = reclaimed
		}
		s.checked = now
	}
	used := s.used
	floor := s.cfg.FloorBytes
	if s.paused {
		floor = s.cfg.ResumeBytes
	}
	if used >= s.cfg.MaxBytes || reserve > s.cfg.MaxBytes-used || available < floor || reserve > available-floor {
		s.paused = true
		return errors.New("capture disk budget exhausted")
	}
	s.paused = false
	return nil
}

func (s *Spool) Append(record Record) error {
	b, err := json.Marshal(record)
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if s.pending != "" {
		if err = s.Seal(); err != nil {
			return err
		}
	}
	// Conservative reservation covers uncompressed input plus gzip/manifest overhead.
	if err = s.admit(uint64(len(b)) + uint64(len(b))/100 + 4096); err != nil {
		return err
	}
	if s.file != nil && (s.raw+int64(len(b)) > s.cfg.SegmentBytes || time.Since(s.opened) >= s.cfg.Interval) {
		if err = s.Seal(); err != nil {
			return err
		}
	}
	if s.file == nil {
		s.id = randomID()
		if s.id == "" {
			return errors.New("capture ID unavailable")
		}
		s.file, err = exclusiveFile(filepath.Join(s.cfg.Root, "open", s.id+".part"))
		if err != nil {
			return err
		}
		s.gz = gzip.NewWriter(&spoolWriter{spool: s, file: s.file})
		s.opened = time.Now()
		s.count = 0
		s.raw = 0
	}
	n, err := s.gz.Write(b)
	if err == nil && n != len(b) {
		err = io.ErrShortWrite
	}
	if err == nil {
		err = s.gz.Flush()
	}
	if err != nil {
		s.abandon()
		return err
	}
	s.count++
	s.raw += int64(len(b))
	return nil
}

func (s *Spool) abandon() {
	if s.file != nil {
		s.file.Close()
		_ = os.Rename(s.file.Name(), filepath.Join(s.cfg.Root, "quarantine", s.id+".part"))
	}
	s.file = nil
	s.gz = nil
	s.count = 0
	s.raw = 0
}

func (s *Spool) Seal() (result error) {
	defer func() {
		if result != nil {
			s.publishFailures++
		}
	}()
	if s.file != nil {
		if err := s.gz.Close(); err != nil {
			s.abandon()
			return err
		}
		if err := s.file.Sync(); err != nil {
			s.abandon()
			return err
		}
		name := s.file.Name()
		if err := s.file.Close(); err != nil {
			s.abandon()
			return err
		}
		s.file = nil
		s.gz = nil
		s.pending = name
	}
	if s.pending == "" {
		return nil
	}
	manifest, err := manifestForSegment(s.pending, s.id)
	if err != nil {
		return err
	}
	dir := filepath.Join(s.cfg.Root, "sealed")
	finalManifest := filepath.Join(dir, s.id+".manifest.json")
	if existing, e := loadManifest(finalManifest); e == nil {
		if existing != manifest {
			return errors.New("pending manifest conflict")
		}
	} else {
		if !os.IsNotExist(e) {
			return e
		}
		tmp := filepath.Join(dir, s.id+"."+randomID()+".manifest.part")
		defer os.Remove(tmp)
		if err = writePrivateJSON(tmp, manifest); err != nil {
			return err
		}
		rename := s.cfg.Rename
		if rename == nil {
			rename = os.Rename
		}
		if err = rename(tmp, finalManifest); err != nil {
			return err
		}
		s.used += uint64(lenMustJSON(manifest))
	}
	// Manifest first: a failed publish leaves the completed gzip in open/ and
	// Seal can retry. The shipper never deletes data for a missing data file.
	if err = syncDir(dir); err != nil {
		return err
	}
	finalData := filepath.Join(dir, s.id+".jsonl.gz")
	if s.pending != finalData {
		if err = os.Rename(s.pending, finalData); err != nil {
			return err
		}
	}
	s.pending = filepath.Join(dir, s.id+".jsonl.gz")
	sync := s.cfg.SyncDir
	if sync == nil {
		sync = syncDir
	}
	if err = sync(dir); err != nil {
		return err
	}
	if err = sync(filepath.Join(s.cfg.Root, "open")); err != nil {
		return err
	}
	s.pending = ""
	s.count = 0
	s.raw = 0
	return nil
}

func (s *Spool) Rotate() error {
	if err := s.Reconcile(); err != nil {
		return err
	}
	if s.pending != "" {
		return s.Seal()
	}
	if s.file != nil && time.Since(s.opened) >= s.cfg.Interval {
		return s.Seal()
	}
	return nil
}
func (s *Spool) Close() error {
	err := s.Seal()
	if s.lock != nil {
		_ = syscall.Flock(int(s.lock.Fd()), syscall.LOCK_UN)
		if e := s.lock.Close(); err == nil {
			err = e
		}
		s.lock = nil
	}
	return err
}

func validateID(id string) error {
	if len(id) != 32 || strings.ToLower(id) != id {
		return errors.New("invalid segment ID")
	}
	_, err := hex.DecodeString(id)
	return err
}
func loadManifest(path string) (Manifest, error) {
	var m Manifest
	info, err := os.Lstat(path)
	if err != nil {
		return m, err
	}
	if !info.Mode().IsRegular() || info.Size() > 4096 {
		return m, errors.New("unsafe manifest size/type")
	}
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return m, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 4097))
	if err != nil {
		return m, err
	}
	if len(b) > 4096 {
		return m, errors.New("manifest too large")
	}
	err = json.Unmarshal(b, &m)
	if err != nil {
		return m, err
	}
	if m.Schema != 1 || m.Bytes <= 0 || m.Bytes > 256<<20 || m.Records <= 0 || len(m.SHA256) != 64 {
		return m, errors.New("invalid manifest")
	}
	if err = validateID(m.ID); err != nil {
		return m, err
	}
	if _, err = hex.DecodeString(m.SHA256); err != nil {
		return m, fmt.Errorf("invalid hash: %w", err)
	}
	return m, nil
}

type spoolWriter struct {
	spool *Spool
	file  *os.File
}

func (w *spoolWriter) Write(b []byte) (int, error) {
	n, err := w.file.Write(b)
	w.spool.used += uint64(n)
	if uint64(n) <= w.spool.available {
		w.spool.available -= uint64(n)
	} else {
		w.spool.available = 0
	}
	return n, err
}

// Reconcile runs on the background maintenance tick, never per interaction.
// It also corrects conservative overcounts after interrupted shipper cleanup.
func (s *Spool) Reconcile() error {
	lock, err := os.OpenFile(filepath.Join(s.cfg.Root, "ship.lock"), os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		if err == syscall.EWOULDBLOCK || err == syscall.EAGAIN {
			return nil
		}
		return err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	n, err := s.usage()
	if err != nil {
		return err
	}
	reclaimed, err := readReclaimed(s.cfg.Root)
	if err != nil {
		return err
	}
	s.used = n
	s.reclaimed = reclaimed
	s.checked = s.cfg.Now()
	return nil
}

func lenMustJSON(v any) int { b, _ := json.Marshal(v); return len(b) }
func manifestForSegment(path, id string) (Manifest, error) {
	var m Manifest
	if err := validateID(id); err != nil {
		return m, err
	}
	f, err := os.Open(path)
	if err != nil {
		return m, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return m, err
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return m, err
	}
	gz, err := gzip.NewReader(f)
	if err != nil {
		return m, err
	}
	defer gz.Close()
	d := json.NewDecoder(io.LimitReader(gz, 512<<20+1))
	var count int64
	for {
		var r Record
		err = d.Decode(&r)
		if err == io.EOF {
			break
		}
		if err != nil || r.Schema != 1 || validateID(r.ID) != nil {
			return m, errors.New("invalid recoverable segment")
		}
		count++
	}
	m = Manifest{1, id, hex.EncodeToString(h.Sum(nil)), n, count}
	if err = verifySegment(path, m); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
