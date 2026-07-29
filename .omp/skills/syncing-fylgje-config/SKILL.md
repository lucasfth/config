---
name: syncing-fylgje-config
description: Use when updating OMP config files — ensures changes are propagated to the Fylgje repo and remote machines
---

# Syncing Fylgje Config

## Overview

Huginn's OMP configuration is macOS-specific. Fylgje is the portable version for remote Linux machines, living in `lucasfth/omp-fylgje` and included as a git submodule in the config repo.

## Canonical Source → Deployment Chain

```
~/Desktop/code/config/omp/   (git submodule → lucasfth/omp-fylgje)
        ↓  git push (from submodule or standalone clone)
  github.com/lucasfth/omp-fylgje
        ↓  git clone or curl | bash
  VPS1, VPS2, freyr, mimer  (~/.omp/agent/)
```

## When to Sync

**MUST sync when:**
- `config.yml` changes (model roles, settings)
- `models.yml` changes (new providers, model IDs)
- `hooks/` change (orphan cleanup logic)
- `AGENTS.md` or `RULES.md` change

**No sync needed for:**
- `setup.sh` changes (only matter for new installs)
- `README.md` changes (docs only)

## Sync Workflow

### 1. Edit and push

```bash
cd ~/Desktop/code/config/omp   # git submodule
# Edit files...
git add -A
git commit -m "feat: ..."
git push origin main
```

If pushing from the submodule fails (auth issues), push from the standalone clone:
```bash
cd ~/Desktop/code/omp-fylgje
cp ~/Desktop/code/config/omp/*.yml ~/Desktop/code/config/omp/*.md ~/Desktop/code/config/omp/setup.sh .
cp -r ~/Desktop/code/config/omp/hooks .
git add -A && git commit -m "..." && git push origin main
```

### 2. Bump submodule in config repo

```bash
cd ~/Desktop/code/config
git add omp
git commit -m "chore(omp): bump Fylgje submodule"
```

### 3. Deploy to remote machines

Config-only updates:
```bash
for host in se1 se2 freyr mimer; do
  scp ~/Desktop/code/config/omp/config.yml $host:~/.omp/agent/config.yml
  scp ~/Desktop/code/config/omp/models.yml $host:~/.omp/agent/models.yml
  scp ~/Desktop/code/config/omp/AGENTS.md $host:~/.omp/agent/AGENTS.md
  scp ~/Desktop/code/config/omp/RULES.md $host:~/.omp/agent/RULES.md
  scp ~/Desktop/code/config/omp/hooks/pre/cleanup-orphans.sh $host:~/.omp/agent/hooks/pre/
  scp ~/Desktop/code/config/omp/hooks/post/cleanup-processes.sh $host:~/.omp/agent/hooks/post/
done
```

Full re-install:
```bash
for host in se1 se2 freyr mimer; do
  ssh $host "curl -sL https://raw.githubusercontent.com/lucasfth/omp-fylgje/main/setup.sh | bash"
done
```

## Remote Machines

| Alias | Hostname | OS | OMP Status |
|-------|----------|-----|------------|
| se1 | VPS1 (Ubuntu 24.04) | Linux | Installed 2026-07-29 |
| se2 | VPS2 (Ubuntu 26.04) | Linux | Installed 2026-07-29 |
| freyr | NixOS | Linux | Installed (bun 1.3.13, needs nix-ld for >= 1.3.14) |
| mimer | Ubuntu 24.04 | Linux | Pending |
