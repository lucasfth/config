import { createLocalBashOperations, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export default function userShell(pi: ExtensionAPI): void {
  // Retain Pi's streaming, process-group cancellation and timeout handling.
  const local = createLocalBashOperations();
  pi.on('user_bash', () => ({
    operations: {
      exec(command, cwd, options) {
        // Only user !/!! commands load .zshrc. The model's bash tool is untouched.
        return local.exec(`exec zsh -ic ${shellQuote(command)}`, cwd, options);
      },
    },
  }));
}
