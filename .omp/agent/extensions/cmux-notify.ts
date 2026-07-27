import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { execFileSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", async () => {
    // ── Herdr (preferred — native agent-aware notifications) ──
    if (process.env.HERDR_SOCKET_PATH) {
      try {
        execFileSync("herdr", [
          "notification", "show", "omp",
          "--body", "Response ready",
        ]);
        return;
      } catch {
        // herdr CLI unavailable — fall through to cmux.
      }
    }

    // ── cmux (legacy) ──
    try {
      execFileSync("cmux", [
        "notify",
        "--title", "omp",
        "--body", "Response ready",
      ]);
    } catch {
      // Not running inside cmux — silently no-op.
    }
  });
}
