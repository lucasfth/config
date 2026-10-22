import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Legacy reserve clamp for hosts that size summaries from reserveTokens.
 * Pi 1.4's tracked summary-budget patch caps output independently of the threshold. */
export default function compactionPolicy(pi: ExtensionAPI): void {
  pi.on('session_before_compact', event => {
    event.preparation.settings.reserveTokens = Math.min(event.preparation.settings.reserveTokens, 16384);
  });
}
