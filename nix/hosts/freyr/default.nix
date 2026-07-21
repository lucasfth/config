# Host: freyr (NixOS --- custom build PC)
#
# GPU inference node for EcoRay Call Intelligence Pipeline.
# Dual GPU: RTX 5070 Ti 16GB (WhisperX, Embedding) + RTX 3070 8GB (Vision/Qwen).
# See: nix/modules/klaus-inference.nix for GPU services.
{
  imports = [
    ../../modules/klaus-inference.nix
  ];

  system = "x86_64-linux";
  username = "lucas";
  hostname = "freyr";
  homeDirectory = "/home/lucas";
  timezone = "Europe/Copenhagen";
}
