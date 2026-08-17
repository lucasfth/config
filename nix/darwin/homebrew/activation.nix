{
  config,
  pkgs,
  lib,
  ...
}: let
  user = config.system.primaryUser;
  tapNames = map (tap: tap.name) config.homebrew.taps;
  homeDirectory = config.home-manager.users.${user}.home.homeDirectory;
  moleCompletionCache = "${homeDirectory}/.cache/zsh/mole-completion.zsh";

  moleCompletionScript = ''
    if [ -x /opt/homebrew/bin/mole ]; then
      install -d -m 0755 -o ${user} -g staff "$(dirname "${moleCompletionCache}")"
      if cache=$(sudo -u ${user} -H mktemp "${moleCompletionCache}.XXXXXX"); then
        if sudo -u ${user} -H /bin/sh -c '/opt/homebrew/bin/mole completion zsh > "$1"' -- "$cache"; then
          chmod 0644 "$cache"
          mv -f "$cache" "${moleCompletionCache}"
        else
          rm -f "$cache"
        fi
      fi
    fi
  '';

  brewTrustScript = lib.concatStringsSep "\n" (map (tap: ''
      /opt/homebrew/bin/brew tap "${tap}" 2>/dev/null || true
      sudo -u ${user} -H /opt/homebrew/bin/brew trust "${tap}" 2>/dev/null || true
    '')
    tapNames);

  brewCleanupScript = ''
    BREWFILE=$(find /nix/store -maxdepth 1 -name "*-Brewfile" -newer /run/current-system -print -quit 2>/dev/null)
    if [ -n "$BREWFILE" ] && [ -f "$BREWFILE" ]; then
      HOMEBREW_BUNDLE_FORCE_CLEANUP=1 /opt/homebrew/bin/brew bundle cleanup --force --file "$BREWFILE" || true
    fi
  '';

  brewVulnsScript = ''
    echo "==> Scanning brew packages for known vulnerabilities..."
    VULNS=$(/opt/homebrew/bin/brew vulns --json --severity high 2>/dev/null || true)
    if [ -n "$VULNS" ] && echo "$VULNS" | grep -q '"id"'; then
      echo "$VULNS" | ${pkgs.jq}/bin/jq -r '
        ["FORMULA", "VERSION", "CVEs", "TOP CVE"],
        ["-------", "-------", "----", "-------"],
        (.[] | [
          .formula,
          .version,
          (.vulnerabilities | length | tostring),
          .vulnerabilities[0].id
        ]) | @tsv' 2>/dev/null | column -t -s $'\t' || echo "  (unable to format vulns output)"
      echo ""
      echo "  Run 'brew vulns --severity high' for full details including summaries."
    else
      echo "  No HIGH+ severity vulnerabilities found."
    fi
    echo ""
  '';
in {
  # Trust third-party taps so Homebrew doesn't refuse on rebuild.
  # Runs before the main homebrew activation (which runs brew bundle).
  system.activationScripts.preActivation.text = ''
    ${brewTrustScript}
  '';

  # Brew 5.x cleanup + CVE scan — both run after homebrew bundle finishes.
  system.activationScripts.postActivation.text = ''
    if command -v /opt/homebrew/bin/brew >/dev/null 2>&1; then
      ${brewCleanupScript}
      ${brewVulnsScript}
      ${moleCompletionScript}
    fi
  '';
}
