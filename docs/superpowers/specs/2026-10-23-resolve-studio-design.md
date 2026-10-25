# Resolve Studio and video plugins

Approved direction: direct Blackmagic Studio installer, Gyroflow OpenFX inside
Resolve, and a separate CorridorKey 2.0 Apple Silicon feasibility check.

## Ownership and scope

- nix-darwin owns installation policy in `nix/darwin/davinci-resolve.nix`.
- Gyroflow OpenFX is pinned to the current `gyroflow/gyroflow-plugins` release;
  its predecessor `gyroflow/gyroflow-ofx` explicitly redirects there.
- Keep the signed upstream DMG unchanged in the Nix store. Activation mounts it
  read-only and copies only Gyroflow's bundle using ditto to preserve signed
  extended attributes. Refuse unmanaged collisions; skip routine activation
  while Resolve is open. Other plugins are untouched. Retain successful-upgrade
  backups until manually removed after verification; roll back failed installs.
- Studio uses a locally supplied, hash-pinned Blackmagic PKG via `requireFile`.
  Until supplied, leave the installed free edition untouched and report the
  missing installer. Never substitute the old Resolve 19 free installer.
- Lucas enters the activation key himself. Never put licensing material,
  preferences, footage or project libraries in Nix.
- The CK2 community MLX CLI is Apache-2.0 code; weights retain the restricted
  Corridor Key Licence 2.0 and third-party terms. Test outside the live Resolve
  installation. It is not the official paid plugin or the old 0.7.6 OFX build.
  Do not promise a Resolve bridge until actual inference is demonstrated.

## Acceptance

Build the pinned Gyroflow package, verify the DMG's Gatekeeper assessment and
bundle signature, and exercise OFX discovery against its native binary. Test
activation refusal/idempotence in isolated directories. Evaluate the Darwin
configuration without activation. Live installation needs root privileges;
Resolve UI discovery is a separate acceptance check.

Studio acceptance requires a supplied installer, signature verification, approved
installation and a live Studio launch. Existing project data must remain intact.
CK2 acceptance requires a real model/output test, not just CLI help.

## Execution plan

1. Package Gyroflow 2.1.1 from its signed/notarized upstream DMG with no fixup.
2. Add narrow guarded installation helpers and isolated regression checks.
3. Wire the Darwin module; keep Studio installer optional until Lucas supplies it.
4. Build/evaluate and document activation, upgrade, refusal and rollback behavior.
5. Run a bounded CK2 MLX experiment on this 18 GiB Mac, recording actual results
   and limitations. Do not install a purported CK2 OFX plugin.

No commit/push or unrelated system rebuild is authorized by this document.
