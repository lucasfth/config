{
  config,
  pkgs,
  ...
}: let
  fafnir = import ./fafnir-package.nix {inherit pkgs;};
in {
  # Existing shell configuration places ~/.local/bin first; no alias or checkout dependency.
  home.file.".local/bin/fafnir".source = "${fafnir}/bin/fafnir";
}
