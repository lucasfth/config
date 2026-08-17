{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    (python312.withPackages (ps:
      with ps; [
        pip
        virtualenv
        jupyterlab
        numpy
        pillow
      ]))
    nodejs_22
    go
    rustc
    cargo
    ruby
    zig
    gradle
    mono
    yarn
    bazel
    scala-cli
    typst
    uv
  ];
}
