# NixOS hardware configuration for Mimer — TUXEDO workstation
#
# ⚠️  THIS IS A STUB. Must be regenerated on first NixOS boot:
#     nixos-generate-config --root /mnt
#     cp /mnt/etc/nixos/hardware-configuration.nix ./nix/hosts/mimer/hardware-configuration.nix
#
# Hardware summary:
#   CPU:      AMD Ryzen 7 9700X (8-core, Zen 5)
#   GPU:      NVIDIA RTX PRO 6000 (97GB VRAM, Blackwell)
#   RAM:      128 GB DDR5
#   Storage:  908 GB NVMe SSD (TUXEDO OEM)
#   Network:  Tailscale mesh, onboard Ethernet
#
# The generated file will contain:
#   - filesystem mount points (/, /boot, etc.)
#   - initrd kernel modules (nvme, xhci_pci, etc.)
#   - nixpkgs.hostPlatform = "x86_64-linux"
#   - hardware.cpu.amd.updateMicrocode = true
{ config, lib, pkgs, modulesPath, ... }:

{
  imports = [
    (modulesPath + "/installer/scan/not-detected.nix")
  ];

  # ── FIXME: Generated on first NixOS boot ─────────────────────
  # These are placeholder values. nixos-generate-config will produce
  # the real hardware-configuration.nix with actual UUIDs and modules.

  boot.initrd.availableKernelModules = [
    "nvme" "ahci" "xhci_pci" "usb_storage" "usbhid" "sd_mod"
  ];
  boot.initrd.kernelModules = [ ];
  boot.kernelModules = [ "kvm-amd" ];
  boot.extraModulePackages = [ ];

  fileSystems."/" = {
    device = "/dev/disk/by-uuid/PLACEHOLDER-ROOT-UUID";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-uuid/PLACEHOLDER-BOOT-UUID";
    fsType = "vfat";
    options = [ "fmask=0022" "dmask=0022" ];
  };

  swapDevices = [ ];

  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
  hardware.cpu.amd.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;
}
