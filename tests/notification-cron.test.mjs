import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/notification-cron/worker.mjs';

test('cron calls only the fixed Sites endpoint; public requests cannot dispatch', async () => {
  const original = globalThis.fetch, info = console.info, calls = [], logs = [];
  const secret = 'test-only-secret-'.repeat(4);
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ configured: true, accepted: 3 });
  };
  console.info = (...args) => logs.push(args);
  try {
    assert.equal(worker.fetch().status, 404);
    assert.equal(calls.length, 0);
    await worker.scheduled({}, { PUSH_JOB_KEY: secret });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://baby-tracker.zousendi.chatgpt.site/api/notifications/dispatch');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(calls[0].options.redirect, 'manual');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.equal(JSON.stringify(logs).includes(secret), false);
    assert.equal(logs[0][1].accepted, 3);
  } finally { globalThis.fetch = original; console.info = info; }
});

test('cron fails closed on missing secrets, redirects, auth errors and false success', async () => {
  const original = globalThis.fetch, secret = 'test-only-secret-'.repeat(4);
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({configured:true,accepted:0}); };
    await assert.rejects(worker.scheduled({}, {}), /DISPATCH_SECRET_MISSING/);
    await assert.rejects(worker.scheduled({}, {PUSH_JOB_KEY: secret + '\n'}), /DISPATCH_SECRET_MISSING/);
    assert.equal(calls, 0);
    for (const status of [302, 401, 403, 500]) {
      globalThis.fetch = async () => new Response(null, {status});
      await assert.rejects(worker.scheduled({}, {PUSH_JOB_KEY:secret}), new RegExp(`DISPATCH_HTTP_${status}`));
    }
    globalThis.fetch = async () => Response.json({configured:false,accepted:0});
    await assert.rejects(worker.scheduled({}, {PUSH_JOB_KEY:secret}), /DISPATCH_NOT_READY/);
    globalThis.fetch = async () => new Response('<html>Sign in</html>');
    await assert.rejects(worker.scheduled({}, {PUSH_JOB_KEY:secret}), /DISPATCH_INVALID_JSON/);
    globalThis.fetch = async () => { throw new Error(secret); };
    await assert.rejects(worker.scheduled({}, {PUSH_JOB_KEY:secret}), error => error.message === 'DISPATCH_NETWORK_OR_TIMEOUT_ERROR' && !error.message.includes(secret));
  } finally { globalThis.fetch = original; }
});
