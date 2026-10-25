#!/usr/bin/env python3
"""Evaluate Gimle's safety boundaries without activating either host."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SUMMARY = r'''c: let
  hm = c.home-manager.users.${c.system.primaryUser};
in {
  username = c.system.primaryUser;
  hostname = c.networking.hostName;
  home = hm.home.homeDirectory;
  nixManaged = c.nix.enable;
  agents = builtins.attrNames c.launchd.user.agents;
  casks = map (x: x.name) c.homebrew.casks;
  brews = map (x: x.name) c.homebrew.brews;
  taps = map (x: x.name) c.homebrew.taps;
  packages = map (x: x.pname or x.name) hm.home.packages;
  files = builtins.attrNames hm.home.file;
  pythonPackages = builtins.concatMap (p:
    map (x: x.pname or x.name) (p.paths or []))
    (builtins.filter (p: builtins.match "python3-.*-env" p.name != null) hm.home.packages);
  hooks = builtins.attrNames hm.home.activation;
  postActivation = c.system.activationScripts.postActivation.text;
  signing = hm.programs.git.signing.signByDefault;
  vim = hm.programs.vim.packageConfigurable.pname;
  sshIncludes = hm.programs.ssh.includes;
  gpgAgent = hm.services.gpg-agent.enable;
}'''


def config(host):
    return json.loads(subprocess.check_output([
        "nix", "eval", "--json", f".#darwinConfigurations.{host}.config",
        "--apply", SUMMARY,
    ], cwd=ROOT, text=True))


def main():
    mini = config("gimle")
    assert (mini["username"], mini["hostname"], mini["home"]) == (
        "gimle", "gimle", "/Users/gimle")
    assert not mini["nixManaged"], "Determinate must retain Nix ownership"
    assert mini["agents"] == ["nix-health"], mini["agents"]
    assert not mini["casks"] and not mini["taps"]
    assert mini["brews"] == ["bun", "container", "herdr"]
    assert not mini["signing"], "Do not require the MacBook's private signing key"
    assert not mini["gpgAgent"], "Headless Gimle must not inherit the signing agent"
    assert mini["vim"] == "vim", mini["vim"]
    assert not mini["sshIncludes"], mini["sshIncludes"]
    assert "jupyterlab" not in mini["pythonPackages"], mini["pythonPackages"]
    assert {"pip", "virtualenv", "numpy", "pillow"}.issubset(mini["pythonPackages"])
    assert not {"aerospace", "jankyborders", "lmstudio", "sioyek", "mactap", "superbacked"}.intersection(mini["packages"])
    assert not {"muninn", "muninn-readable", ".aerospace.toml", ".omp/agent/AGENTS.md"}.intersection(mini["files"])
    assert not {
        "generateOmpMcpConfig", "generateRaycastAiProviders", "generateMokka",
        "configureSyntaxHighlight", "configureSpotifast", "installSioyek",
        "sshEcorayHosts", "herdrOmpIntegration",
    }.intersection(mini["hooks"])
    assert "pmset -b" not in mini["postActivation"]
    assert "DisplayLink" not in mini["postActivation"]

    laptop = config("lucas-macbook-pro")
    assert laptop["home"] == "/Users/lucasfreytorreshanson"
    assert {"aerospace", "muninn-readable", "volundr-delivery", "nix-health", "tailwind-cleanup"} == set(laptop["agents"])
    assert {"displaylink", "ghostty", "gyroflow"}.issubset(laptop["casks"])
    assert {"generateOmpMcpConfig", "generateMokka", "installSioyek"}.issubset(laptop["hooks"])
    assert laptop["signing"]
    assert laptop["gpgAgent"], "Keep the MacBook's signing agent"
    assert laptop["vim"] == "vim-full", laptop["vim"]
    assert laptop["sshIncludes"] == ["config.d/ecoray"]
    assert "jupyterlab" in laptop["pythonPackages"], laptop["pythonPackages"]
    assert {"sshEcorayHosts", "herdrOmpIntegration"}.issubset(laptop["hooks"])
    assert "pmset -b powernap 0" in laptop["postActivation"]
    print("PASS: Gimle identity and host isolation; MacBook integrations retained")


if __name__ == "__main__":
    main()
