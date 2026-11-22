import { createApp } from './create-app.js';
import { createFakeCarriers } from './fake-carriers.js';

const app = await createApp({
  transport: createFakeCarriers(),
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'demo-webhook-secret',
});
await app.listen(Number(process.env.PORT ?? 3000));

console.log(`Listening on ${await app.getUrl()}`);
console.log('Try: GET /shipments/swiftship/SS-1001, GET /shipments/parcelgo/7781, GET /health/integrations');
