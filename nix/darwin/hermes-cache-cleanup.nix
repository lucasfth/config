{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: let
  cfg = config.services.hermes-cache-cleanup;
  user = config.system.primaryUser;
  home = "/Users/${user}";
  hermesBase = "${home}/loki-data/live/hermes";
  lokiData = "${home}/loki-data";

  # Build script using normal strings: ${...} = Nix interpolation, \${...} = literal shell ${
  # $var in normal strings is literal $, so shell $var stays $var
  scriptLines = [
    "#!${pkgs.bash}/bin/bash"
    "set -euo pipefail"
    "HERMES_BASE=\"${hermesBase}\""
    "LOKI_DATA=\"${lokiData}\""
    "THRESHOLD=${toString cfg.alertThreshold}"
    "KEEP=${toString cfg.keepLogCount}"
    "MAX_SIZE=\"${cfg.maxLogSize}\""
    ""
    "log() { echo \"[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*\"; }"
    ""
    "# Exit if encrypted volume is not mounted"
    "if ! mount | awk -v mnt=\"${lokiData}\" '$3 == mnt {found=1} END {exit !found}'; then"
    "  log \"SKIP: ${lokiData} not mounted\""
    "  exit 0"
    "fi"
    ""
    "# Parse maxLogSize (e.g., 100M, 50M, 1G) to bytes"
    "parse_size() {"
    "  local size=\"$1\""
    "  local num=\"\${size%[KMG]}\""
    "  local unit=\"\${size##*[0-9]}\""
    "  case \"\$unit\" in"
    "    K) echo \$((num * 1024)) ;;"
    "    M) echo \$((num * 1024 * 1024)) ;;"
    "    G) echo \$((num * 1024 * 1024 * 1024)) ;;"
    "    *) echo \"\$num\" ;;"
    "  esac"
    "}"
    "MAX_BYTES=\$(parse_size \"\$MAX_SIZE\")"
    ""
    "# Rotate gateway.log"
    "LOG_FILE=\"\$HERMES_BASE/logs/gateway.log\""
    "if [[ -f \"\$LOG_FILE\" ]]; then"
    "  SIZE=\$(stat -f%z \"\$LOG_FILE\" 2>/dev/null || stat -c%s \"\$LOG_FILE\" 2>/dev/null || echo 0)"
    "  if [[ \$SIZE -gt \$MAX_BYTES ]]; then"
    "    log \"Rotating gateway.log (\$SIZE bytes > \$MAX_BYTES bytes)\""
    "    for i in \$(seq \$((KEEP - 1)) -1 1); do"
    "      [[ -f \"\${LOG_FILE}.\$i\" ]] && mv \"\${LOG_FILE}.\$i\" \"\${LOG_FILE}.\$((i + 1))\""
    "    done"
    "    cp \"\$LOG_FILE\" \"\${LOG_FILE}.1\" && : > \"\$LOG_FILE\""
    "  fi"
    "fi"
    ""
    "# Clean regenerable caches"
    "for cache in pnpm uv node-compile-cache; do"
    "  CACHE_DIR=\"\$HERMES_BASE/cache/\$cache\""
    "  if [[ -d \"\$CACHE_DIR\" ]]; then"
    "    log \"Cleaning \$cache cache\""
    "    rm -rf \"\$CACHE_DIR\""
    "    mkdir -p \"\$CACHE_DIR\""
    "  fi"
    "done"
    ""
    "# Disk usage alert"
    "USAGE=\$(df -h \"\$HERMES_BASE\" 2>/dev/null | awk 'NR==2 {gsub(/%/,\"\",\$5); print \$5}')"
    "if [[ -n \"\$USAGE\" && \"\$USAGE\" -gt \"\$THRESHOLD\" ]]; then"
    "  log \"ALERT: \$HERMES_BASE at \$USAGE% (threshold: \$THRESHOLD%)\""
    "else"
    "  log \"Disk usage: \$USAGE% (threshold: \$THRESHOLD%)\""
    "fi"
    ""
    "log \"Cleanup complete\""
  ];

  cleanupScript = pkgs.writeScriptBin "hermes-cache-cleanup" (lib.strings.concatStringsSep "\n" scriptLines);
in {
  options.services.hermes-cache-cleanup = {
    enable = lib.mkEnableOption "Hermes regenerable cache cleanup and log rotation (Gimle only)";
    schedule = lib.mkOption {
      type = lib.types.str;
      default = "daily";
      description = "Launchd schedule (daily or weekly)";
    };
    alertThreshold = lib.mkOption {
      type = lib.types.int;
      default = 85;
      description = "Disk usage percentage threshold for alert";
    };
    keepLogCount = lib.mkOption {
      type = lib.types.int;
      default = 2;
      description = "Number of rotated gateway logs to keep";
    };
    maxLogSize = lib.mkOption {
      type = lib.types.str;
      default = "100M";
      description = "Maximum size per gateway log file (e.g., 100M, 50M, 1G)";
    };
  };

  config = lib.mkIf (cfg.enable && hostname == "gimle") {
    launchd.user.agents."hermes-cache-cleanup" = {
      serviceConfig = {
        Label = "dk.loki.hermes-cache-cleanup";
        ProgramArguments = ["${cleanupScript}/bin/hermes-cache-cleanup"];
        StartCalendarInterval = lib.mkIf (cfg.schedule == "daily") {
          Hour = 3;
          Minute = 0;
        };
        StandardOutPath = "${hermesBase}/logs/cache-cleanup.log";
        StandardErrorPath = "${hermesBase}/logs/cache-cleanup.err.log";
        RunAtLoad = false;
      };
    };

    launchd.user.agents."hermes-cache-cleanup-weekly" = lib.mkIf (cfg.schedule == "weekly") {
      serviceConfig = {
        Label = "dk.loki.hermes-cache-cleanup-weekly";
        ProgramArguments = ["${cleanupScript}/bin/hermes-cache-cleanup"];
        StartCalendarInterval = {
          Weekday = 0;
          Hour = 3;
          Minute = 0;
        };
        StandardOutPath = "${hermesBase}/logs/cache-cleanup.log";
        StandardErrorPath = "${hermesBase}/logs/cache-cleanup.err.log";
        RunAtLoad = false;
      };
    };
  };
}
