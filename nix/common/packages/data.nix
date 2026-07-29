{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    duckdb
    juicefs
  ];
}
