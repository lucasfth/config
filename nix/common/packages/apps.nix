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
      swiftbar
      jankyborders
      lmstudio
      sioyek
    ]
    ++ lib.optionals stdenv.isLinux [
      nvidia-docker
      ollama
    ];
}
