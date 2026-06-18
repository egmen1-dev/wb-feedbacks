import autoReplyBatch from '../feedbacks/auto-reply-batch.js';
import { authorizeCronRequest } from '../../lib/cron-auth.js';
import { sendCronJson } from '../../lib/cron-response.js';

export default async function handler(req, res) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return sendCronJson(
      res,
      401,
      {
        ok: false,
        error: 'Unauthorized',
        action: 'auth-failed',
        ...auth,
      },
      { source: 'cron' }
    );
  }

  if (!process.env.WB_API_TOKEN?.trim()) {
    return sendCronJson(
      res,
      200,
      {
        ok: false,
        skipped: true,
        action: 'skipped',
        reason: 'WB_API_TOKEN не задан — серверный cron отключён',
        authMode: auth.mode,
        hint: 'Задайте WB_API_TOKEN в Vercel (Production) и сделайте Redeploy.',
      },
      { source: 'cron' }
    );
  }

  return autoReplyBatch(req, res, { source: 'cron', authMode: auth.mode });
}
