{
  config,
  pkgs,
  lib,
  ...
}: {
  # ──────────────────────────────────────────────────────────────
  # macOS System Defaults
  # ──────────────────────────────────────────────────────────────
  system.defaults = {
    NSGlobalDomain = {
      AppleKeyboardUIMode = 3;
      KeyRepeat = 2;
      InitialKeyRepeat = 15;
      NSAutomaticCapitalizationEnabled = false;
      NSAutomaticDashSubstitutionEnabled = false;
      NSAutomaticPeriodSubstitutionEnabled = false;
      NSAutomaticQuoteSubstitutionEnabled = false;
      NSAutomaticSpellingCorrectionEnabled = false;
      AppleShowAllExtensions = true;
      NSWindowResizeTime = 0.001;
      NSNavPanelExpandedStateForSaveMode = true;
      NSNavPanelExpandedStateForSaveMode2 = true;
      PMPrintingExpandedStateForPrint = true;
      PMPrintingExpandedStateForPrint2 = true;
      NSDocumentSaveNewDocumentsToCloud = false;
    };

    dock = {
      autohide = true;
      autohide-delay = 0.0;
      autohide-time-modifier = 0.3;
      orientation = "bottom";
      show-recents = false;
      minimize-to-application = true;
      magnification = true;
      persistent-apps = [
        "/Applications/Zen.app"
        "/System/Applications/Mail.app"
        "/System/Applications/Calendar.app"
      ];
      persistent-others = [
        "/Users/${config.system.primaryUser}/Downloads"
      ];
    };

    finder = {
      ShowExternalHardDrivesOnDesktop = true;
      ShowHardDrivesOnDesktop = false;
      ShowRemovableMediaOnDesktop = true;
      ShowMountedServersOnDesktop = true;
      ShowPathbar = true;
      ShowStatusBar = true;
      FXPreferredViewStyle = "Nlsv";
      FXDefaultSearchScope = "SCcf";
      QuitMenuItem = true;
      FXEnableExtensionChangeWarning = false;
    };

    trackpad = {
      Clicking = true;
      TrackpadThreeFingerDrag = true;
    };
    screencapture = {
      disable-shadow = true;
      location = "/Users/${config.system.primaryUser}/Desktop/screenshots";
    };

    loginwindow = {
      SHOWFULLNAME = true;
    };
  };

  # ── Apply extra macOS defaults not covered by nix-darwin ──────
  system.activationScripts.extra.text = ''
    # Use function keys as standard function keys (F1-F12)
    defaults write -g com.apple.keyboard.fnState -bool true

    # Trackpad speed (0=slow, 3=fast)
    defaults write -g com.apple.trackpad.scaling -float 2.5

    # Auto-hide menu bar
    defaults write -g _HIHideMenuBar -bool true

    # Disable click-wallpaper-to-show-desktop (conflicts with Stage Manager)
    defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -bool false

    # Disable "reopen windows when logging back in"
    defaults write com.apple.loginwindow TALLogoutSavesState -bool false

    # Show hidden files in Finder
    defaults write com.apple.finder AppleShowAllFiles -bool true

    # Expand save panel by default
    defaults write -g NSNavPanelExpandedStateForSaveMode -bool true

    # Disable press-and-hold for keys (enable key repeat)
    defaults write -g ApplePressAndHoldEnabled -bool false

    # Hot corners:
    #  0 = nothing, 2 = Mission Control, 3 = App Windows,
    #  4 = Desktop, 5 = Screensaver, 6 = Sleep, 7 = Notifications
    defaults write com.apple.dock wvous-tl-corner -int 2   # Top-left → Mission Control
    defaults write com.apple.dock wvous-tl-modifier -int 0
    defaults write com.apple.dock wvous-br-corner -int 4   # Bottom-right → Desktop
    defaults write com.apple.dock wvous-br-modifier -int 0

    # Disable automatic rearranging of Spaces
    defaults write com.apple.dock mru-spaces -bool false

    # Save screenshots as PNG
    defaults write com.apple.screencapture type -string "png"
  '';
}
