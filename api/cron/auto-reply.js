import autoReplyBatch from '../feedbacks/auto-reply-batch.js';
import { authorizeCronRequest } from '../../lib/cron-auth.js';

export default async function handler(req, res) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      action: 'auth-failed',
      ...auth,
    });
  }

  if (!process.env.WB_API_TOKEN?.trim()) {
    return res.status(200).json({
      ok: false,
      skipped: true,
      action: 'skipped',
      reason: 'WB_API_TOKEN не задан — серверный cron отключён',
      authMode: auth.mode,
      hint: 'Задайте WB_API_TOKEN в Vercel (Production) и сделайте Redeploy.',
    });
  }

  return autoReplyBatch(req, res);
}
