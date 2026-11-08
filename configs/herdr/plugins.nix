# Fixed-output plugin inputs; evaluated by Home Manager and standalone checks.
{pkgs}: let
  inherit (pkgs) lib;
  omniAssets = {
    aarch64-darwin = ["aarch64-apple-darwin" "8f4069e4d9e33bb4d5ece6ae4bf3749557b8cb355ec5630b4716019a0295c196"];
    x86_64-darwin = ["x86_64-apple-darwin" "dfb59f3b15049ad48e58b91c1e917a2cba9eaf1eac916406c8d02dcad5268efb"];
    aarch64-linux = ["aarch64-unknown-linux-musl" "67388abe9871f60c64d842980268476807ed167233dec023ef30930582704287"];
    x86_64-linux = ["x86_64-unknown-linux-musl" "b2827bd076f2cb32e9e57fbce3636ae13805cce8f649a41fd5699ec4dee169bb"];
  };
  omniSource = pkgs.fetchFromGitHub {
    owner = "mmjang";
    repo = "herdr-omni";
    rev = "c22a8aed0755d7d7b4b8d5efc8eee385d98fe4a8";
    hash = "sha256-rSfQN8lUHkm+CNHMEbKCD7wDOo9gbA940DzfzgyqDg0=";
  };
  patchedOmniSource = pkgs.applyPatches {
    name = "herdr-omni-0.17.2-source";
    src = omniSource;
    patches = [./omni/patches/0001-compact-layout.patch];
  };
  omniBuild = pkgs.rustPlatform.buildRustPackage {
    pname = "herdr-omni";
    version = "0.17.2";
    src = patchedOmniSource;
    cargoLock.lockFile = "${omniSource}/Cargo.lock";
    cargoBuildFlags = ["--locked" "--bin" "herdr-omni"];
    # Fails identically on unpatched upstream c22a8aed in the Nix sandbox (first failure: tag lookup returns None at config_search_update.rs:502); not caused by the layout patch.
    cargoTestFlags = ["--locked" "--" "--skip" "update_cache_write_preserves_state_changed_during_tag_lookup" "--skip" "update_caches_negative_lookup_and_accepts_large_versions" "--skip" "update_check_cancellation_terminates_descendants_holding_pipes" "--skip" "update_check_install_and_pin_eligibility_use_native_commands" "--skip" "update_does_not_cache_a_failed_tag_lookup" "--skip" "update_ignores_valid_stdout_from_failed_plugin_listing" "--skip" "update_rejects_failed_post_install_listing_even_with_valid_json" "--skip" "update_rejects_invalid_offers_and_existing_locks"];
    doCheck = true;
  };
  renameSource = pkgs.fetchFromGitHub {
    owner = "qu8n";
    repo = "herdr-automatic-rename";
    rev = "a99754357fdea3119c430fd0cad822eef9047895";
    hash = "sha256-XZUXfq+tkanNia5L4ycrr62edJTdYojxwiJqXJ0VT64=";
  };
in {
  omni = pkgs.runCommand "herdr-omni-0.17.2" {} ''
    mkdir -p "$out/bin"
    cp ${./omni/herdr-plugin.toml} "$out/herdr-plugin.toml"
    cp ${omniBuild}/bin/herdr-omni "$out/bin/herdr-omni"
    chmod +x "$out/bin/herdr-omni"
  '';
  automaticRename =
    pkgs.runCommand "herdr-automatic-rename-0.15.0" {
      nativeBuildInputs = [pkgs.makeWrapper];
    } ''
      mkdir -p "$out/shell"
      for file in automatic-rename.sh naming.sh git.sh icons.sh transcript.sh herdr-plugin.toml LICENSE; do
        cp ${renameSource}/"$file" "$out/$file"
      done
      cp ${renameSource}/shell/hook.zsh "$out/shell/hook.zsh"
      chmod +x "$out/automatic-rename.sh"
      patchShebangs "$out"
      wrapProgram "$out/automatic-rename.sh" \
        --prefix PATH : ${lib.makeBinPath [pkgs.jq pkgs.coreutils pkgs.gnused pkgs.gnugrep pkgs.gawk pkgs.findutils]}
    '';
}
