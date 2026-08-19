{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  # ──────────────────────────────────────────────────────────────
  # Git
  # ──────────────────────────────────────────────────────────────
  programs.git = {
    enable = true;
    # Identity and signing are host-specific; shared settings must not select an account.
    signing = lib.mkIf (hostname == "lucas-macbook-pro") {
      key = "E8DE72E441853146";
      signByDefault = true;
    };
    settings =
      {
        init.defaultBranch = "main";
        pull.rebase = true;
        core.pager = "${pkgs.delta}/bin/delta";
        diff.colorMoved = "default";
        interactive.diffFilter = "${pkgs.delta}/bin/delta --color-only";
        delta.navigate = true;
        merge.conflictstyle = "zdiff3";
      }
      // (
        if hostname == "lucas-macbook-pro"
        then {
          user = {
            name = lib.mkForce "lucasfth";
            email = lib.mkForce "online@lucashanson.dk";
          };
        }
        else if lib.hasPrefix "Alexanders-Mac-mini" hostname
        then {
          user = {
            name = "KlimaKlaus";
            email = "klaus@ecoray.dk";
          };
        }
        else {}
      );
  };

  # ──────────────────────────────────────────────────────────────
  # GitHub CLI
  # ──────────────────────────────────────────────────────────────
  programs.gh = {
    enable = true;
    settings = {
      git_protocol = "ssh";
      user = "lucasfth";
    };
  };

  # ──────────────────────────────────────────────────────────────
  # GPG (for commit signing)
  # ──────────────────────────────────────────────────────────────
  programs.gpg = {
    enable = true;
    # Your secret key is already in the keyring (~/.gnupg/).
    # Home Manager can also manage public keys and config, but
    # for now we just ensure GPG is available.
    settings = {
      # Use a modern key format
      keyid-format = "long";
      with-keygrip = true;
    };
  };

  services.gpg-agent = {
    enable = true;
    # Let GPG agent serve as SSH agent too (useful for git+ssh)
    enableSshSupport = true;
    # Cache PIN for 8 hours
    defaultCacheTtl = 28800;
    maxCacheTtl = 28800;
  };
}
