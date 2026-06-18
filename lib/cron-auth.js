export function readCronSecret() {
  return process.env.CRON_SECRET?.trim() || '';
}

export function readBearerToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  return String(auth).replace(/^Bearer\s+/i, '').trim();
}

export function isVercelCronRequest(req) {
  const flag = req.headers?.['x-vercel-cron'];
  return flag === '1' || flag === 1 || String(flag || '').toLowerCase() === 'true';
}

/**
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
 * It also sets x-vercel-cron: 1 (not spoofable on Vercel).
 */
export function authorizeCronRequest(req) {
  const cronSecret = readCronSecret();
  if (!cronSecret) {
    return { ok: true, mode: 'open' };
  }

  const bearer = readBearerToken(req);
  if (bearer && bearer === cronSecret) {
    return { ok: true, mode: 'bearer' };
  }

  if (isVercelCronRequest(req)) {
    return { ok: true, mode: 'x-vercel-cron' };
  }

  return {
    ok: false,
    mode: 'unauthorized',
    hint:
      'Ожидается Authorization: Bearer <CRON_SECRET> или заголовок x-vercel-cron от Vercel Cron. После добавления CRON_SECRET сделайте Redeploy production.',
    hasAuthorizationHeader: Boolean(bearer),
    hasVercelCronHeader: isVercelCronRequest(req),
    cronSecretConfigured: true,
  };
}
