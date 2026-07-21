# Host: freyr (NixOS — custom build PC)
#
# Freyr is a Vanir god in Norse mythology — brother of
# Freyja, ruler of peace, prosperity, and fair weather. He famously gave away
# his magic sword (a weapon that fought on its own) in exchange for love.
#
# This machine follows the same trade: instead of a gaming GPU pushing frames
# for entertainment, the NVIDIA card here is surrendered to LLM inference,
# model training, and developer tooling — compute in service of creation,
# not combat. A fitting namesake for a dev/LLM workstation that gives up
# conventional gaming power for a different kind of prosperity.
{
  imports = [
    ../../modules/klaus-inference.nix
  ];

  system = "x86_64-linux";          # Custom build PC — change if not x86_64
  username = "lucas";               # User on NixOS
  hostname = "freyr";
  homeDirectory = "/home/lucas";
  stateVersion = "25.05";           # Pin to the NixOS version at install time
}
