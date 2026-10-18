import { setupCli } from './node_modules/@earendil-works/pi-coding-agent/dist/cli/setup.js';
import { main } from './node_modules/@earendil-works/pi-coding-agent/dist/main.js';
setupCli();
await main(process.argv.slice(2));
