{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    ffmpeg
    imagemagick
    libass
    tesseract
    xz
    pandoc
    cmake
    gcc
  ];
}
