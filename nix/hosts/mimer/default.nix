# Host: mimer (TUXEDO Ubuntu 24.04 — home-manager standalone)
#
# Mimer is a giant in Norse mythology — the wisest of the
# Æsir, guardian of the Well of Wisdom (Mímisbrunnr) beneath the roots of
# Yggdrasil. He dispenses knowledge to those who seek it, and even Odin
# sacrificed an eye to drink from Mimer's well.
#
# This machine is EcoRay's internal LLM inference server, running
# Qwen3.5-122B (72GB model) on an RTX PRO 6000 (96GB VRAM). Like its
# namesake, Mimer serves wisdom on demand — answering questions, reviewing
# code, and powering the fleet of EcoRay AI agents.
#
# Home-manager only — Ubuntu stays as the OS. CUDA drivers and
# Tailscale are managed by Ubuntu, not Nix. llama.cpp is a custom
# build (not Nix-packaged) due to the 72GB model requirements.
#
# GPU pipeline worker (Python FastAPI, port 9880) is managed via a
# home-manager systemd user service.
{
  system = "x86_64-linux";
  username = "ecoray-admin";
  hostname = "mimer";
  homeDirectory = "/home/ecoray-admin";
  stateVersion = "24.11";
}
