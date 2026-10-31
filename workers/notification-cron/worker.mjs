// Independent scheduler only. No database bindings or application hosting.
// Configure PUSH_JOB_KEY as an encrypted Secret in the Cloudflare dashboard.
const DISPATCH_URL = 'https://baby-tracker.zousendi.chatgpt.site/api/notifications/dispatch';

export default {
  fetch() {
    // Public visits must never trigger dispatch or reveal configuration.
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  },

  async scheduled(_controller, env) {
    if (typeof env.PUSH_JOB_KEY !== 'string' || env.PUSH_JOB_KEY.length < 32 || /\s/.test(env.PUSH_JOB_KEY)) {
      throw new Error('DISPATCH_SECRET_MISSING_OR_INVALID');
    }

    let response;
    try {
      response = await fetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PUSH_JOB_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: '{}',
        // Never forward the secret to a redirect, even to a sign-in page.
        redirect: 'manual',
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      // Never log request objects, headers, raw errors or response bodies.
      throw new Error('DISPATCH_NETWORK_OR_TIMEOUT_ERROR');
    }

    if (!response.ok) throw new Error(`DISPATCH_HTTP_${response.status}`);
    let result;
    try { result = await response.json(); }
    catch { throw new Error('DISPATCH_INVALID_JSON'); }
    if (result?.configured !== true || !Number.isInteger(result.accepted) || result.accepted < 0) {
      throw new Error('DISPATCH_NOT_READY_OR_INVALID_RESPONSE');
    }
    // An accepted push is not proof of delivery to an iPhone.
    console.info('Notification dispatch completed', { accepted: result.accepted });
  },
};
