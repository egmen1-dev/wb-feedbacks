import { appendCronActivity } from './cron-activity-log.js';

export async function sendCronJson(res, statusCode, data, { source = 'cron' } = {}) {
  const entry = {
    at: new Date().toISOString(),
    source,
    statusCode,
    action: data.action || (statusCode === 401 ? 'auth-failed' : 'unknown'),
    ok: data.ok ?? statusCode < 400,
    error: data.error || data.reason || data.message || null,
    feedbackId: data.feedbackId || null,
    productName: data.productName || null,
    authMode: data.authMode || null,
  };
  await appendCronActivity(entry).catch((err) => {
    console.warn('[cron-response] log failed:', err.message);
  });
  return res.status(statusCode).json(data);
}
