# Host: mimer (NixOS — TUXEDO workstaton, Mimer Data center)
#
# Mimer is a wise giant in Norse mythology — keeper of the Well of Wisdom
# (Mímisbrunnr) at the root of Yggdrasil. Odin sacrificed an eye to drink
# from it and gained cosmic knowledge. Mimer was later beheaded during the
# Æsir-Vanir war, but Odin preserved the head with herbs and magic so he
# could continue to consult it for counsel.
#
# This machine follows the legend: an oracle of inference. The NVIDIA RTX
# PRO 6000 with 97GB VRAM is poured entirely into running large language
# models — the Well of Wisdom that agents and tools query for answers.
# Named Mimer because it speaks wisdom, not frames.
{
  system = "x86_64-linux";
  username = "ecoray-admin";
  hostname = "mimer";
  homeDirectory = "/home/ecoray-admin";
  stateVersion = "25.05";
}
