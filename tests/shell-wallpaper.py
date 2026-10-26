#!/usr/bin/env python3
"""Exercise the actual wallpaper startup block; never invoke GUI automation."""
import os
from pathlib import Path
import pty
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'nix/common/shell/init.nix').read_text()
BLOCK = SOURCE.split('    # ── Mokka wallpaper reload', 1)[1].split('    alias nix-search', 1)[0]
BLOCK = BLOCK[BLOCK.index('\n'):].replace("''${", '${')


class Wallpaper(unittest.TestCase):
    def check_context(self, *, interactive, terminal, ssh, expected):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / 'Pictures/wallpapers').mkdir(parents=True)
            (home / 'Pictures/wallpapers/mokka-test.heic').touch()
            flag = home / '.mokka-reload'
            flag.touch()
            binary = home / 'bin'
            binary.mkdir()
            mock = binary / 'osascript'
            mock.write_text('#!/bin/sh\ntouch "$HOME/gui-called"\n')
            mock.chmod(0o700)
            env = os.environ.copy()
            for name in ('SSH_CONNECTION', 'SSH_TTY', 'SSH_CLIENT'):
                env.pop(name, None)
            env.update(HOME=str(home), PATH=str(binary) + ':/usr/bin:/bin')
            if ssh:
                env['SSH_CONNECTION'] = 'fixture'
            master, slave = pty.openpty()
            try:
                subprocess.run(['/bin/zsh', '-fic' if interactive else '-fc', BLOCK],
                               stdin=slave if terminal else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=env, timeout=3, check=True)
            finally:
                os.close(master)
                os.close(slave)
            self.assertEqual((home / 'gui-called').exists(), expected)
            self.assertEqual(flag.exists(), not expected)

    def test_ssh_terminal_defers_gui(self):
        self.check_context(interactive=True, terminal=True, ssh=True, expected=False)

    def test_nonterminal_shell_defers_gui(self):
        self.check_context(interactive=True, terminal=False, ssh=False, expected=False)

    def test_noninteractive_shell_defers_gui(self):
        self.check_context(interactive=False, terminal=True, ssh=False, expected=False)

    def test_local_interactive_terminal_reloads(self):
        self.check_context(interactive=True, terminal=True, ssh=False, expected=True)


if __name__ == '__main__':
    unittest.main()
