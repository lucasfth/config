import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Native 1.3.0 also uses reserveTokens to size summary output. Keep earlier
 * threshold selection, but don't accidentally authorize a 128k-token summary. */
export default function compactionPolicy(pi: ExtensionAPI): void {
  pi.on('session_before_compact', event => {
    event.preparation.settings.reserveTokens = Math.min(event.preparation.settings.reserveTokens, 16384);
  });
}
