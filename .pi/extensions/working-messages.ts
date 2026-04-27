/**
 * Working Messages Extension
 *
 * Shows randomized messages in the inline working indicator while the agent is working.
 * Uses `ctx.ui.setWorkingIndicator()` to customize the spinner area.
 *
 * Usage:
 *   pi -e .pi/extensions/working-messages.ts
 *
 * Or ensure it's in the auto-discovery path:
 *   ~/.pi/agent/extensions/working-messages.ts
 *   .pi/extensions/working-messages.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const MESSAGES = [
	"🤔 Hallucinating responsibly",
	"🧠 Pretending to think",
	"📋 Blaming the context window",
	"💭 Consulting my imagination",
	"⚡ Speed-running your tech debt",
	"🤔 Overthinking this",
	"🙏 Apologizing in advance",
	"✨ Vibing with your codebase",
	"🎲 Guessing unreliably",
	"💩 Making shit up",
	"🔧 Making it work on my machine",
	"📞 Dialing a friend",
	"📚 Ignoring the documentation",
	"🕵️ Hiding the console logs",
	"🧪 Testing in prod",
	"🍪 Eating all the tokens",
	"🐛 Arguing that the bug is a feature",
	"☕ Drinking coffee",
  "😴 Taking a break",
  "🗑️ Deleting useful code",
  "🔌 Turning it off and on again",
  "🎭 Method acting as a senior dev",
  "✂️ Trimming the parts you actually needed",
  "📉 Forgetting the start of this conversation",
  "🧊 Freezing up at the finish line",
];

const FRAME_DISPLAY_TIME_MIN = 1500;
const FRAME_DISPLAY_TIME_MAX = 5000;

export default function (pi: ExtensionAPI) {
	let messageTimeout: ReturnType<typeof setTimeout> | null = null;

	function stopMessages(ctx: ExtensionContext) {
		if (messageTimeout) {
			clearTimeout(messageTimeout);
			messageTimeout = null;
		}

		ctx.ui.setWorkingIndicator(undefined);
	}

	function startMessages(ctx: ExtensionContext) {
		stopMessages(ctx);

		const showFrame = () => {
			const message = MESSAGES[randomIntFromInterval(0, MESSAGES.length - 1)];
			ctx.ui.setWorkingIndicator({
				frames: [message],
			});

			messageTimeout = setTimeout(() => {
				showFrame();
			}, randomIntFromInterval(FRAME_DISPLAY_TIME_MIN, FRAME_DISPLAY_TIME_MAX));
		};

		showFrame();
	}

	pi.on("agent_start", async (_event, ctx) => {
		startMessages(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		stopMessages(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopMessages(ctx);
	});

  function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
}