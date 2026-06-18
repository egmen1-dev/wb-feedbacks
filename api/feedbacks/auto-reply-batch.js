import {
  fetchUnansweredFeedbacks,
  postFeedbackAnswer,
  WbFeedbacksRateLimitError,
} from '../../lib/wb-feedbacks.js';
import feedbackDraftHandler from './feedback-draft.js';
import { isDraftSafeForAutoSend } from '../../lib/feedback-auto-reply.js';
import { readBearerToken, readCronSecret, isVercelCronRequest } from '../../lib/cron-auth.js';
import { sendCronJson } from '../../lib/cron-response.js';

const TAKE = 20;
/** Extra pause between batch steps (on top of wb-feedbacks throttle). */
const BATCH_STEP_DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readToken(req) {
  const cronSecret = readCronSecret();
  const fromHeader = readBearerToken(req);

  if (cronSecret && fromHeader === cronSecret) {
    return process.env.WB_API_TOKEN?.trim() || null;
  }

  if (cronSecret && isVercelCronRequest(req)) {
    return process.env.WB_API_TOKEN?.trim() || null;
  }

  if (fromHeader) return fromHeader;
  if (req.body?.token) return String(req.body.token).trim();
  return process.env.WB_API_TOKEN?.trim() || null;
}

function callDraftHandler(feedback, token, { regenerate = false } = {}) {
  return new Promise((resolve, reject) => {
    const variationSeed = Date.now() + Math.floor(Math.random() * 10_000);
    const fakeReq = {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { feedback, catalogRows: [], regenerate, variationSeed, autoReply: true },
    };
    const fakeRes = {
      statusCode: 200,
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, data });
      },
      end() {},
    };
    feedbackDraftHandler(fakeReq, fakeRes).catch(reject);
  });
}

export default async function handler(req, res, options = {}) {
  const logSource = options.source || (isVercelCronRequest(req) ? 'cron' : 'batch');
  const logMeta = { source: logSource, authMode: options.authMode || null };

  async function respond(statusCode, data) {
    if (logSource === 'cron' || isVercelCronRequest(req)) {
      return sendCronJson(res, statusCode, { ...data, authMode: data.authMode ?? logMeta.authMode }, logMeta);
    }
    return res.status(statusCode).json(data);
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Используйте GET или POST' });
  }

  const token = readToken(req);
  if (!token) {
    return respond(503, {
      ok: false,
      action: 'skipped',
      error: 'WB_API_TOKEN не задан',
      hint: 'Для серверного автоответчика задайте WB_API_TOKEN в Vercel или используйте клиентский режим (вкладка открыта).',
    });
  }

  try {
    const { feedbacks } = await fetchUnansweredFeedbacks(token, { take: TAKE, skip: 0 });
    const feedback = (feedbacks || []).find((fb) => fb?.id);
    if (!feedback) {
      return respond(200, { ok: true, action: 'idle', message: 'Нет неотвеченных отзывов' });
    }

    await sleep(BATCH_STEP_DELAY_MS);

    let draftResult = await callDraftHandler(feedback, token, { regenerate: false });
    let check = isDraftSafeForAutoSend(draftResult.data);
    let retried = false;

    if (draftResult.status !== 200 || !check.ok) {
      retried = true;
      await sleep(BATCH_STEP_DELAY_MS);
      draftResult = await callDraftHandler(feedback, token, { regenerate: true });
      check = isDraftSafeForAutoSend(draftResult.data);
    }

    if (draftResult.status !== 200) {
      return respond(draftResult.status, {
        ok: false,
        action: 'draft-failed',
        feedbackId: feedback.id,
        error: draftResult.data?.error,
        hint: draftResult.data?.hint,
      });
    }

    if (!check.ok) {
      return respond(200, {
        ok: false,
        action: 'skipped',
        feedbackId: feedback.id,
        reason: check.reason,
        retried,
      });
    }

    const text = String(draftResult.data.draft || '').trim();
    await sleep(BATCH_STEP_DELAY_MS);
    const answer = await postFeedbackAnswer(token, feedback.id, text, { skipVerify: true });

    return respond(200, {
      ok: true,
      action: 'sent',
      feedbackId: feedback.id,
      productName: feedback.productName,
      verified: answer?.verified ?? null,
      provider: draftResult.data.provider,
      retried,
      preview: text.slice(0, 120),
    });
  } catch (error) {
    if (error instanceof WbFeedbacksRateLimitError) {
      const retryAfterSec = error.retryAfterSec || 5;
      res.setHeader('Retry-After', String(retryAfterSec));
      return respond(429, {
        ok: false,
        action: 'rate-limit',
        code: 'RATE_LIMIT',
        retryAfterSec,
        error: error.message,
      });
    }
    console.error('[feedbacks/auto-reply-batch]', error);
    return respond(500, { ok: false, action: 'error', error: error.message || 'Ошибка автоответа' });
  }
}
