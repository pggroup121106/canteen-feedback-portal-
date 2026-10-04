import { Redis } from '@upstash/redis';

type EmailTier = 'admin' | 'hr' | 'plant_head' | 'top_management';

type EmailDeliveryLog = {
  id: string;
  timestamp: string;
  tier: EmailTier;
  recipient_email: string;
  recipient_name?: string;
  plant_id: string;
  plant_name: string;
  reporting_period: string;
  feedbacks_count: number;
  satisfied_count: number;
  unsatisfied_count: number;
  status: 'success' | 'failed';
  error_message?: string;
  message_id?: string;
  subject: string;
};

const EMAIL_LOGS_KEY = 'canteen:email_logs:list';

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing KV_REST_API_URL / KV_REST_API_TOKEN');
  }
  return new Redis({ url, token });
}

function parseEntry<T>(raw: unknown): T | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object') return null;
    return value as T;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const redis = getRedis();

    // 1. GET RECENT EMAIL LOGS
    if (req.method === 'GET') {
      const rows = await redis.lrange(EMAIL_LOGS_KEY, 0, 200);
      const logs: EmailDeliveryLog[] = [];

      for (const row of rows || []) {
        const entry = parseEntry<EmailDeliveryLog>(row);
        if (entry?.id) logs.push(entry);
      }

      const tier = req.query?.tier ? String(req.query.tier).trim() : '';
      const plantId = req.query?.plant_id ? String(req.query.plant_id).trim() : '';

      let filtered = logs;
      if (tier && tier !== 'all') {
        filtered = filtered.filter((l) => l.tier === tier);
      }
      if (plantId && plantId !== 'all') {
        filtered = filtered.filter((l) => l.plant_id === plantId || l.plant_id === 'all');
      }

      return res.status(200).json({ ok: true, logs: filtered, total: filtered.length });
    }

    // 2. LOG NEW EMAIL DISPATCH
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }
      body = body || {};

      const logEntry: EmailDeliveryLog = {
        id: body.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: body.timestamp || new Date().toISOString(),
        tier: body.tier || 'admin',
        recipient_email: body.recipient_email || 'unknown@pgel.in',
        recipient_name: body.recipient_name,
        plant_id: body.plant_id || 'all',
        plant_name: body.plant_name || 'All Plants',
        reporting_period: body.reporting_period || 'Last 24 Hours',
        feedbacks_count: Number(body.feedbacks_count) || 0,
        satisfied_count: Number(body.satisfied_count) || 0,
        unsatisfied_count: Number(body.unsatisfied_count) || 0,
        status: body.status === 'failed' ? 'failed' : 'success',
        error_message: body.error_message,
        message_id: body.message_id,
        subject: body.subject || 'Canteen Feedback Management Report',
      };

      await redis.lpush(EMAIL_LOGS_KEY, JSON.stringify(logEntry));
      // Trim to maintain recent 500 logs max
      await redis.ltrim(EMAIL_LOGS_KEY, 0, 500);

      return res.status(201).json({ ok: true, log: logEntry });
    }

    // 3. CLEAR LOGS
    if (req.method === 'DELETE') {
      await redis.del(EMAIL_LOGS_KEY);
      return res.status(200).json({ ok: true, message: 'Email delivery logs cleared' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[email-logs] API error:', error);
    return res.status(500).json({
      error: 'Failed to process email logs',
      details: error?.message || String(error),
    });
  }
}
