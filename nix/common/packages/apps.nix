{
  config,
  pkgs,
  lib,
  ...
}: {
  home.packages = with pkgs;
    [
      docker
    ]
    ++ lib.optionals stdenv.isDarwin [
      sketchybar
      sketchybar-app-font
      sioyek
      jankyborders
      lmstudio
    ]
    ++ lib.optionals stdenv.isLinux [
      nvidia-docker
      ollama
    ];
}
