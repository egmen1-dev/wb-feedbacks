import { getDeployMeta } from '../../lib/deploy-meta.js';
import { readYandexConfig } from '../../lib/yandex-gpt.js';

function envPresent(name) {
  return Boolean(process.env[name]?.trim());
}

export function getAiConfigStatus() {
  const serverCronEnabled = envPresent('WB_API_TOKEN');
  const cronSecretConfigured = envPresent('CRON_SECRET');
  const yandexConfigured = Boolean(readYandexConfig());
  const openaiConfigured = envPresent('OPENAI_API_KEY');
  const aiReady = yandexConfigured || openaiConfigured;

  let serverCronHint = 'Серверный cron выключен — задайте WB_API_TOKEN в Vercel';
  if (serverCronEnabled && !aiReady) {
    serverCronHint =
      'WB_API_TOKEN задан, но нет YandexGPT/OpenAI — cron не сможет сгенерировать черновики';
  } else if (serverCronEnabled && !cronSecretConfigured) {
    serverCronHint =
      'Серверный cron: каждые 6 мин. CRON_SECRET не задан — /api/cron/auto-reply открыт (рекомендуется секрет)';
  } else if (serverCronEnabled) {
    serverCronHint =
      'Серверный cron: каждые 6 мин (CRON_SECRET + WB_API_TOKEN). Держите переключатель «Вкл» выключенным — иначе двойные запросы к WB и 429.';
  }

  return {
    yandexConfigured,
    openaiConfigured,
    serverCronEnabled,
    cronSecretConfigured,
    serverCronReady: serverCronEnabled && aiReady,
    serverCronHint,
    envPresent: {
      YANDEX_GPT_API_KEY: envPresent('YANDEX_GPT_API_KEY'),
      YANDEX_CLOUD_API_KEY: envPresent('YANDEX_CLOUD_API_KEY'),
      YANDEX_FOLDER_ID: envPresent('YANDEX_FOLDER_ID'),
      YANDEX_GPT_MODEL: envPresent('YANDEX_GPT_MODEL'),
      OPENAI_API_KEY: openaiConfigured,
      WB_API_TOKEN: serverCronEnabled,
      CRON_SECRET: cronSecretConfigured,
    },
    ...getDeployMeta(),
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Используйте GET или POST' });
  }

  return res.status(200).json(getAiConfigStatus());
}
