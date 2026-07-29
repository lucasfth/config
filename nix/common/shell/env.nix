{
  config,
  pkgs,
  lib,
}: {
  content = ''

    # ── Time format ─────────────────────────────────────────
    TIMEFMT=$'\n================\nCPU\t%P\nuser\t%*U\nsystem\t%*S\ntotal\t%*E'
  '';
}
