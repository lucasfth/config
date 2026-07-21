{ config, lib, pkgs, ... }:

{
  users.users.lucas.linger = true;

  systemd.user.services.klaus-inference = {
    description = "Klaus GPU Inference Services";
    after = [ "network-online.target" "multi-user.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "default.target" ];

    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = "lucas";
      Group = "users";
      WorkingDirectory = "/home/lucas/klaus-services";
      Environment = [
        "PATH=/home/lucas/inference-env/bin:/run/wrappers/bin:/home/lucas/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/run/current-system/sw/bin"
        "LD_LIBRARY_PATH=/run/opengl-driver/lib:/run/opengl-driver-32/lib"
      ];
      ExecStartPre = "${pkgs.bash}/bin/bash -c 'for port in 8081 8082 9090 5000 8083 9880; do pid=$(${pkgs.iproute2}/bin/ss -tlnp 2>/dev/null | grep \":$port \" | grep -oP \"pid=\\K[0-9]+\" || true); [ -n \"$pid\" ] && kill \"$pid\" 2>/dev/null; done; sleep 2'";
      ExecStart = "${pkgs.bash}/bin/bash /home/lucas/klaus-services/start-services.sh";
      ExecStartPost = "${pkgs.bash}/bin/bash -c 'source /home/lucas/inference-env/bin/activate && cd /home/lucas/klaus-services && nohup python3 gpu_pipeline_worker.py > /tmp/gpu-pipeline-worker.log 2>&1 &'";
      ExecStop = "${pkgs.bash}/bin/bash -c 'for port in 8081 8082 9090 5000 8083 9880; do pid=$(${pkgs.iproute2}/bin/ss -tlnp 2>/dev/null | grep \":$port \" | grep -oP \"pid=\\K[0-9]+\" || true); [ -n \"$pid\" ] && kill \"$pid\" 2>/dev/null; done'";
      TimeoutStartSec = 120;
      TimeoutStopSec = 30;
    };
  };
}
