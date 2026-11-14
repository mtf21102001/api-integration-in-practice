import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fx from './fixtures.js';
import { parseGraphQL } from './graphql.js';
import { parseRest } from './rest.js';
import { parseSoap } from './soap.js';

test('REST: unwraps data on success', () => {
  const r = parseRest(fx.rest.ok.status, fx.rest.ok.body);
  assert.deepEqual(r, { ok: true, data: { id: 'C-42', name: 'Acme' } });
});

test('REST: 200 with success:false is a business error', () => {
  const r = parseRest(fx.rest.okButFailed.status, fx.rest.okButFailed.body);
  assert.equal(!r.ok && r.error.kind, 'business');
  assert.equal(!r.ok && r.error.code, 'INSUFFICIENT_BALANCE');
  assert.equal(!r.ok && r.error.retryable, false);
});

test('REST: 503 is retryable, 404 is not', () => {
  const unavailable = parseRest(503, fx.rest.serverError.body);
  const notFound = parseRest(404, fx.rest.notFound.body);
  assert.equal(!unavailable.ok && unavailable.error.retryable, true);
  assert.equal(!notFound.ok && notFound.error.retryable, false);
  assert.equal(!notFound.ok && notFound.error.message, 'customer not found');
});

test('SOAP: returns the Body on success', () => {
  const r = parseSoap(fx.soap.ok.status, fx.soap.ok.xml);
  assert.ok(r.ok && r.data.includes('<Balance>120.50</Balance>'));
});

test('SOAP 1.1: client fault is not retryable', () => {
  const r = parseSoap(fx.soap.clientFault.status, fx.soap.clientFault.xml);
  assert.equal(!r.ok && r.error.kind, 'soap_fault');
  assert.equal(!r.ok && r.error.message, 'Invalid account number');
  assert.equal(!r.ok && r.error.retryable, false);
});

test('SOAP 1.2: receiver fault is retryable', () => {
  const r = parseSoap(fx.soap.serverFault12.status, fx.soap.serverFault12.xml);
  assert.equal(!r.ok && r.error.code, 'env:Receiver');
  assert.equal(!r.ok && r.error.message, 'Backend timeout');
  assert.equal(!r.ok && r.error.retryable, true);
});

test('GraphQL: errors with 200 and no data is a failure', () => {
  const r = parseGraphQL(fx.graphql.errorWith200.status, fx.graphql.errorWith200.body);
  assert.equal(!r.ok && r.error.kind, 'graphql');
  assert.equal(!r.ok && r.error.code, 'FORBIDDEN');
});

test('GraphQL: partial data keeps the data and surfaces warnings', () => {
  const r = parseGraphQL(fx.graphql.partial.status, fx.graphql.partial.body);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.warnings, ['customer.invoices: Invoices service timed out']);
});
