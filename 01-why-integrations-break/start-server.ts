import { MODES, startFlakyApi } from './flaky-api.js';

const port = Number(process.env.PORT ?? 4000);
const api = await startFlakyApi({ port });

console.log(`Flaky API running at ${api.url}\n`);
for (const mode of [...MODES, 'random']) {
  console.log(`  curl -i "${api.url}/orders/A-1001?mode=${mode}"`);
}
console.log('\nPress Ctrl+C to stop.');
