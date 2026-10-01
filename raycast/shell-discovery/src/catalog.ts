export type ShellTip = {
  id: string;
  title: string;
  category: string;
  description: string;
  example: string;
  shortcut?: string;
  caution?: string;
  /** Regular-expression source matched against local command positions. */
  historyPattern?: string;
};

const shortcutHistoryNote =
  "History cannot establish shortcut use; this is a keyboard action rather than a command recorded in history.";

export const shellTips: readonly ShellTip[] = [
  {
    id: "edit-command-line",
    title: "Edit the current command in Vim",
    category: "keybinding",
    description: `${shortcutHistoryNote} Ctrl+X c or Ctrl+X Ctrl+E opens the current command buffer in Vim, independently of $EDITOR and $VISUAL. Saving and quitting returns the edited text to the prompt without executing it.`,
    example:
      "Type a long command, press Ctrl+X then lowercase c, edit it in Vim, and save with :wq. Review the returned command before pressing Enter.",
    shortcut: "Ctrl+X c / Ctrl+X Ctrl+E",
  },
  {
    id: "undo",
    title: "Undo edits to the command buffer",
    category: "keybinding",
    description: `${shortcutHistoryNote} Undo recent changes in the current Zsh command line without leaving the prompt.`,
    example:
      "Type `git status`, alter it, then press Ctrl+_ to undo the latest edit.",
    shortcut: "Ctrl+_",
  },
  {
    id: "magic-space",
    title: "Expand history references without running them",
    category: "keybinding",
    description: `${shortcutHistoryNote} The magic-space binding expands history references such as !! and !$ when you insert a space, so you can inspect the resulting command before pressing Return.`,
    example:
      "Type `echo !!` and press Space to expand the previous command in place.",
    shortcut: "Space",
    caution:
      "Review the expanded command before executing it; history expansion can include sensitive arguments.",
  },
  {
    id: "prefix-history",
    title: "Search history by command prefix",
    category: "keybinding",
    description: `${shortcutHistoryNote} Ctrl+P and Ctrl+N move through history entries matching the text already typed at the prompt.`,
    example:
      "Type `ssh` and press Ctrl+P to find the previous command beginning with `ssh`.",
    shortcut: "Ctrl+P / Ctrl+N",
  },
  {
    id: "fzf-history",
    title: "Search history with fzf",
    category: "keybinding",
    description: `${shortcutHistoryNote} Press Ctrl+R to open the local fzf history picker, then select a command to place it in the prompt for review.`,
    example:
      "Press Ctrl+R, type `deploy`, choose a result, and edit it before pressing Return.",
    shortcut: "Ctrl+R",
    caution:
      "The picker reads local shell history; avoid showing it while screen-sharing.",
  },
  {
    id: "fzf-tab",
    title: "Use fzf-tab for completion previews",
    category: "keybinding",
    description: `${shortcutHistoryNote} Press Tab to invoke fzf-tab completion with directory previews; a shared prefix may expand on the first Tab.`,
    example:
      "Type `cd ~/Do` and press Tab to choose from matching directories with a preview.",
    shortcut: "Tab",
  },
  {
    id: "copy-buffer",
    title: "Copy the current command buffer",
    category: "keybinding",
    description: `${shortcutHistoryNote} Copy the command currently being edited to the macOS clipboard without executing it.`,
    example:
      "Prepare a command, press Ctrl+X Ctrl+Y, then paste it into a note for review.",
    shortcut: "Ctrl+X Ctrl+Y",
  },
  {
    id: "clear-screen-scrollback",
    title: "Clear screen and scrollback while keeping the buffer",
    category: "keybinding",
    description: `${shortcutHistoryNote} Ctrl+X Ctrl+L clears the terminal screen and scrollback while preserving the command at the prompt; the configured widget clears the tmux pane history as well.`,
    example:
      "Type a command you still want, press Ctrl+X Ctrl+L, and continue editing on a clean screen.",
    shortcut: "Ctrl+X Ctrl+L",
  },
  {
    id: "git-commit-buffer",
    title: "Insert a commit template into the prompt",
    category: "keybinding",
    description: `${shortcutHistoryNote} Ctrl+X g c inserts the command template "git commit -m "" and places the cursor inside the quotes; it does not execute the command.`,
    example:
      "Stage changes, press Ctrl+X g c, type a concise message, and review the full command before Return.",
    shortcut: "Ctrl+X g c",
  },
  {
    id: "zmv",
    title: "Preview batch renames with zmv",
    category: "files",
    description:
      "Use Zsh's zmv for pattern-based renames. Start with -n for a dry run, inspect every proposed destination, then remove -n only when the result is correct.",
    example: "zmv -n '(*).log' '$1.txt'",
    caution:
      "The example is deliberately a dry run. Remove -n only after reviewing the proposed moves and confirming the destinations are what you intend.",
    historyPattern: "^zmv(?:\\s|$)",
  },
  {
    id: "zoxide",
    title: "Jump to frequently used directories with zoxide",
    category: "navigation",
    description:
      "z and zi use zoxide's local directory database to jump by a remembered path or interactively choose one.",
    example: "z projects",
    historyPattern: "^(?:z|zi)(?:\\s|$)",
  },
  {
    id: "named-directories",
    title: "Use short names for common directories",
    category: "navigation",
    description:
      "Named directories make paths such as ~config, ~code, and ~downloads available wherever Zsh accepts a path.",
    example: "cd ~config/nix/common",
    historyPattern:
      "^(?:(?:cd|pushd|ls|fd|rg|bat|code|open|nvim|nano|cat|less|mkdir|rm|cp|mv|tar)(?:\\s+[^;&|]*?)?\\s+)?~(?:config|code|downloads)(?:[/\\s]|$)",
  },
  {
    id: "suffix-aliases",
    title: "Open files by suffix",
    category: "files",
    description:
      "Type a filename to open it with your chosen tool: vue, ts, tsx, js, jsx, nix, json, py, sh, zsh, go, and rs use VS Code; yaml, yml, and toml use Vim; md, txt, and log use bat.",
    example: "README.md",
    caution:
      'Quote filenames containing spaces only when invoking an explicit tool, for example `bat "report draft.md"`; fully quoting a path suppresses suffix-alias expansion, so use `report\\ draft.md` at the prompt.',
    historyPattern:
      "^(?:[^\\s;&|]+\\.(?:vue|md|txt|log|json|ya?ml|toml|nix|z?sh|py|go|rs|jsx?|tsx?))(?:\\s|$)",
  },
  {
    id: "direnv-trust",
    title: "Trust a direnv project explicitly",
    category: "workflow",
    description:
      "direnv can load project-specific environment variables, but a directory must be explicitly approved with `direnv allow`; entering a directory never grants trust automatically.",
    example: "direnv allow",
    caution:
      "Read the .envrc before allowing it. Environment files can change PATH, credentials, and commands.",
    historyPattern: "^direnv\\s+allow(?:\\s|$)",
  },
  {
    id: "shared-history",
    title: "Keep shared history useful and private",
    category: "history",
    description:
      "The configured Zsh history is shared across sessions and deduplicated. A leading space excludes a command from history when the relevant Zsh option is enabled.",
    example: "  printf '%s\\n' 'temporary local check'",
    caution:
      "Leading-space exclusion is not a security boundary: the command may still be visible to the current terminal or another tool.",
    historyPattern: "^(?:fc|history)(?:\\s|$)",
  },
  {
    id: "bat",
    title: "Read files with syntax highlighting",
    category: "tools",
    description:
      "bat displays syntax-highlighted files with line numbers and paging. It is also the viewer used by the text-file suffix aliases.",
    example: "bat README.md",
    historyPattern: "^bat(?:\\s|$)",
  },
  {
    id: "fd",
    title: "Find files by name with fd",
    category: "tools",
    description:
      "fd searches filenames with concise regular expressions. Restrict the type or extension instead of scanning file contents.",
    example: "fd --type f --extension nix . ~config",
    historyPattern: "^fd(?:\\s|$)",
  },
  {
    id: "jq",
    title: "Extract fields from JSON with jq",
    category: "tools",
    description:
      "jq selects and transforms structured JSON without brittle text matching. Quote the filter so Zsh does not interpret its punctuation.",
    example: "jq '.scripts' ~config/raycast/shell-discovery/package.json",
    historyPattern: "^jq(?:\\s|$)",
  },
  {
    id: "rg",
    title: "Search file contents with ripgrep",
    category: "tools",
    description:
      "rg searches file contents recursively and respects ignore files by default. Use a file glob to narrow the search.",
    example: "rg --glob '*.nix' 'history' ~config/nix",
    historyPattern: "^rg(?:\\s|$)",
  },
  {
    id: "delta",
    title: "Read diffs with delta",
    category: "tools",
    description:
      "delta highlights diffs and is already configured as the Git pager. When viewing a diff, n/N jump between sections and / searches.",
    example: "git diff",
    historyPattern: "^(?:delta(?:\\s|$)|git\\s+(?:diff|show|log)(?:\\s|$))",
  },
  {
    id: "nrs-safety",
    title: "Treat nrs as an activation command",
    category: "workflow",
    description:
      "nrs performs a nix-darwin activation. Discovering or discussing a change must never auto-execute it; run nrs only after reviewing the pending configuration and explicitly choosing to activate.",
    example: "nrs",
    caution:
      "This command changes the machine configuration. Never place it in an automatic discovery action.",
    historyPattern: "^nrs(?:\\s|$)",
  },
] as const;
