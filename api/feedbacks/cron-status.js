import { getAiConfigStatus } from './ai-config-check.js';
import { getCronStatusSummary } from '../../lib/cron-activity-log.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Используйте GET' });
  }

  const ai = getAiConfigStatus();
  const cron = await getCronStatusSummary({
    serverCronEnabled: ai.serverCronEnabled,
    serverCronReady: ai.serverCronReady,
  });

  return res.status(200).json({
    ok: true,
    ...cron,
    serverCronEnabled: ai.serverCronEnabled,
    serverCronReady: ai.serverCronReady,
  });
}
