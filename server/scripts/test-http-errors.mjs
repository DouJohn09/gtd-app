// serverError: Postgres data exceptions (class 22) are the client's bad input → 400;
// everything else stays a 500.
import assert from 'node:assert/strict';
import { serverError } from '../src/lib/httpErrors.js';

const fakeRes = () => ({
  headersSent: false, statusCode: null, body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});
const req = { method: 'POST', originalUrl: '/api/tasks', baseUrl: '/api/tasks', path: '/', user: { id: 1 } };
const quiet = (fn) => { const e = console.error, w = console.warn; console.error = console.warn = () => {}; try { fn(); } finally { console.error = e; console.warn = w; } };

for (const code of ['22P02', '22003', '22007']) {
  const res = fakeRes();
  quiet(() => serverError(req, res, Object.assign(new Error('invalid input syntax for type integer: "high"'), { code })));
  assert.equal(res.statusCode, 400, code);
  assert.deepEqual(res.body, { error: 'Invalid value' });
}

for (const err of [Object.assign(new Error('connection refused'), { code: '08006' }), new Error('boom'), 'string error']) {
  const res = fakeRes();
  quiet(() => serverError(req, res, err));
  assert.equal(res.statusCode, 500);
}

console.log('http-errors: ok');
