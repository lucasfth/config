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

      mkNixOS = hostname: let
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
        ];
      };

      mkHome = hostname: homeNix: let
        host = mkHost ./nix/hosts/${hostname};
        pkgs = nixpkgs.legacyPackages.${host.system};
      in home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [
          {
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            home-manager.extraSpecialArgs = {
              flakeDir = self;
              inherit (host) username hostname homeDirectory stateVersion;
            };
            home-manager.useUserPackages = true;
            home-manager.users.${host.username} = import homeNix;
          }
        ];
      };
    in {
      darwinConfigurations."lucas-macbook-pro" = mkDarwin "lucas-macbook-pro";

      nixosConfigurations."freyr" = mkNixOS "freyr";

      homeConfigurations."ecoray-admin@mimer" = mkHome "mimer" ./nix/hosts/mimer/home.nix;
    };
}
