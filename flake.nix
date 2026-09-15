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

  outputs = {
    self,
    nixpkgs,
    darwin,
    home-manager,
    ...
  }: let
    lib = nixpkgs.lib;
    mkHost = path: import path;

    mkDarwin = hostname: let
      host = mkHost ./nix/hosts/${hostname};
    in
      darwin.lib.darwinSystem {
        inherit (host) system;
        specialArgs = {
          inherit (host) homeDirectory;
        };
        modules = [
          ./nix/darwin.nix
          home-manager.darwinModules.home-manager
          {
            networking.hostName = host.hostname;
            system.primaryUser = host.username;
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            # Set home.stateVersion at home-manager top level (required by aerospace module)
            home-manager.sharedModules = [
              {home.stateVersion = host.stateVersion;}
              ({lib, ...}: {
                home.homeDirectory = lib.mkForce host.homeDirectory;
              })
            ];
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
    in
      nixpkgs.lib.nixosSystem {
        inherit (host) system;
        modules = [
          ./nix/nixos.nix
          home-manager.nixosModules.home-manager
          {
            networking.hostName = host.hostname;
            nixpkgs.config.allowUnfree = true;
            home-manager.backupFileExtension = "before-nix";
            # Set home.stateVersion at home-manager top level (required by aerospace module)
            home-manager.sharedModules = [
              {home.stateVersion = host.stateVersion;}
            ];
            home-manager.extraSpecialArgs = {
              flakeDir = self;
              inherit (host) username hostname homeDirectory stateVersion;
            };
            home-manager.useUserPackages = true;
            home-manager.users.${host.username} = import ./nix/home.nix;
          }
        ];
      };
    mkHome = hostname: let
      host = mkHost ./nix/hosts/${hostname};
      pkgs = nixpkgs.legacyPackages.${host.system};
    in
      home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [
          {home.stateVersion = host.stateVersion or "25.05";}
          ./nix/hosts/${hostname}/home.nix
        ];
      };
  in {
    darwinConfigurations."lucas-macbook-pro" = mkDarwin "lucas-macbook-pro";

    nixosConfigurations."freyr" = mkNixOS "freyr";

    homeConfigurations."ecoray-admin@mimer" = mkHome "mimer";
  };
}
