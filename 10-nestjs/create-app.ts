import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { IntegrationOptions } from './tokens.js';

/** Build the app. `rawBody: true` keeps the exact bytes, which webhook signatures need (part 08). */
export function createApp(opts: IntegrationOptions) {
  return NestFactory.create(AppModule.forRoot(opts), { rawBody: true, logger: false });
}
