import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin } from '../src/lib/http.ts';

test('same-origin browser requests work with Next.js normalized internal URL', () => {
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/grade', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })), true);
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/grade', { headers: { host: '127.0.0.1:3000', origin: 'http://elsewhere.test' } })), false);
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/grade', { headers: { origin: 'null' } })), false);
});
