# Gimle: always-on Mac mini; services run as gimle, never the MacBook account.
{
  system = "aarch64-darwin";
  username = "gimle";
  hostname = "gimle";
  homeDirectory = "/Users/gimle";
  stateVersion = "24.11";
  nixbldGid = 350;
  tailscaleAtBoot = true;
  lokiProduction = true;
  # Keep off until the restored tunnel has an explicitly coordinated handoff.
  lokiAuxiliary = false;
}
