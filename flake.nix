{
  description = "lucasfreytorreshanson's macOS + NixOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, darwin, home-manager, ... }:
    let
      mkHost = path: import path;

      mkDarwin = hostname: let
        host = mkHost ./nix/hosts/${hostname};
      in darwin.lib.darwinSystem {
        inherit (host) system;
        modules = [
          ./nix/darwin.nix
          home-manager.darwinModules.home-manager
          {
            networking.hostName = host.hostname;
            system.primaryUser = host.username;
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            home-manager.extraSpecialArgs = {
              flakeDir = self;
              inherit (host) username hostname homeDirectory stateVersion;
            };
            home-manager.useUserPackages = true;
            home-manager.users.${host.username} = import ./nix/home.nix;
          }
        ];
      };

      mkNixOS = hostname: extraModules: let
        host = mkHost ./nix/hosts/${hostname};
      in nixpkgs.lib.nixosSystem {
        inherit (host) system;
        modules = [
          ./nix/nixos.nix
          home-manager.nixosModules.home-manager
          {
            networking.hostName = host.hostname;
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            home-manager.extraSpecialArgs = {
              flakeDir = self;
              inherit (host) username hostname homeDirectory stateVersion;
            };
            home-manager.useUserPackages = true;
            home-manager.users.${host.username} = import ./nix/home.nix;
          }
        ] ++ extraModules;
      };

      mkNixOSHost = hostname: mkNixOS hostname [];

      # Headless NixOS — uses nix/nixos/headless-base.nix instead of
      # nix/nixos/default.nix (which imports desktop.nix). Suitable for
      # servers and inference boxes.
      mkNixOSHeadless = hostname: extraModules: let
        host = mkHost ./nix/hosts/${hostname};
      in nixpkgs.lib.nixosSystem {
        inherit (host) system;
        modules = [
          # Base NixOS setup — imports headless-base.nix instead of
          # the desktop-focused nix/nixos/default.nix
          ({ config, pkgs, lib, ... }: {
            imports = [ ./nix/nixos/headless-base.nix ];
            programs.zsh.enable = true;
            # Use bash for ecoray-admin (no zsh needed on headless)
          })
          home-manager.nixosModules.home-manager
          {
            networking.hostName = host.hostname;
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            home-manager.extraSpecialArgs = {
              flakeDir = self;
              inherit (host) username hostname homeDirectory stateVersion;
            };
            home-manager.useUserPackages = true;
            home-manager.users.${host.username} = import ./nix/home.nix;
          }
        ] ++ extraModules;
      };
    in {
      darwinConfigurations."lucas-macbook-pro" = mkDarwin "lucas-macbook-pro";

      nixosConfigurations."freyr" = mkNixOSHost "freyr";

      nixosConfigurations."mimer" = mkNixOSHeadless "mimer" [
        ./nix/hosts/mimer/host.nix
        ({ config, pkgs, lib, ... }: {
          # Mimer-specific home-manager overrides: replace the shared
          # vim/tmux configs with Mimer's Catppuccin dotfiles.
          # Since home.nix imports nix/common/{vim,tmux}.nix which also
          # define programs.vim/programs.tmux, we use mkForce to
          # override any conflicting definitions from the host module.
          # The host module's imports (dotfiles.nix) are applied AFTER
          # home.nix, so they take precedence.
          home-manager.users.ecoray-admin = {
            imports = [
              ./nix/hosts/mimer/dotfiles.nix
            ];
          };
        })
      ];
    };
}
