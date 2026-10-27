{
  description = "lucasfreytorreshanson's macOS + NixOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    # Official desktop, including upstream's Darwin pm-package fix.
    hermes-agent.url = "github:NousResearch/hermes-agent/5a5aa9a3a8d376ebe0013ca6565c184e87318404";
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
    hermes-agent,
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
          inherit (host) homeDirectory hostname;
        };
        modules = [
          ./nix/darwin.nix
          home-manager.darwinModules.home-manager
          {
            networking.hostName = host.hostname;
            system.primaryUser = host.username;
            services.gimle.tailscaleAtBoot = nixpkgs.lib.mkDefault (host.tailscaleAtBoot or false);
            services.gimle.production = nixpkgs.lib.mkDefault (host.lokiProduction or false);
            services.gimle.auxiliary = nixpkgs.lib.mkDefault (host.lokiAuxiliary or false);
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
              hermesDesktop = hermes-agent.packages.${host.system}.desktop;
              hermesDesktopIcon = "${hermes-agent}/apps/desktop/assets/icon.icns";
              # Same electron and agent the upstream desktop wrapper uses.
              hermesElectron = hermes-agent.inputs.nixpkgs.legacyPackages.${host.system}.electron;
              hermesAgent = hermes-agent.packages.${host.system}.default;
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
    packages.aarch64-darwin.hermes-desktop = hermes-agent.packages.aarch64-darwin.desktop;

    darwinConfigurations."lucas-macbook-pro" = mkDarwin "lucas-macbook-pro";
    darwinConfigurations."gimle" = mkDarwin "gimle";

    nixosConfigurations."freyr" = mkNixOS "freyr";

    homeConfigurations."ecoray-admin@mimer" = mkHome "mimer";
  };
}
