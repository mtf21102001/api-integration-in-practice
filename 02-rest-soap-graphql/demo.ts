import * as fx from './fixtures.js';
import { parseGraphQL } from './graphql.js';
import { parseRest } from './rest.js';
import type { IntegrationResult } from './result.js';
import { parseSoap } from './soap.js';

const show = (label: string, status: number, r: IntegrationResult<unknown>) => {
  const head = `  ${label.padEnd(22)} HTTP ${status}  `;
  if (r.ok) {
    const warn = r.warnings ? `   ⚠️  partial: ${r.warnings.join('; ')}` : '';
    console.log(`${head}✅ ok${warn}`);
  } else {
    const e = r.error;
    const code = e.code ? ` [${e.code}]` : '';
    console.log(`${head}❌ ${e.kind}${code}: ${e.message}  (retryable: ${e.retryable})`);
  }
};

console.log('\nREST');
for (const [name, f] of Object.entries(fx.rest)) show(name, f.status, parseRest(f.status, f.body));

console.log('\nSOAP');
for (const [name, f] of Object.entries(fx.soap)) show(name, f.status, parseSoap(f.status, f.xml));

console.log('\nGraphQL');
for (const [name, f] of Object.entries(fx.graphql)) show(name, f.status, parseGraphQL(f.status, f.body));

console.log(`
Notice the HTTP column: two of these failures came back as 200 OK,
and one "success" was only partial.
Three protocols, one result type. The rest of your code only ever sees IntegrationResult.
`);
