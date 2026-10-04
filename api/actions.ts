import { Redis } from '@upstash/redis';

type ActionStatus = 'Pending' | 'In Progress' | 'Action Taken' | 'Closed';

type ActionAuditLog = {
  updated_by: string;
  updated_at: string;
  previous_status?: ActionStatus;
  new_status?: ActionStatus;
  note?: string;
};

type ActionTakenEntry = {
  id: string;
  issue_title: string;
  plant_id: string;
  plant_name?: string;
  feedback_ids: string[];
  complaint_count: number;
  action_description: string;
  responsible_person: string;
  responsible_dept: string;
  action_date: string; // YYYY-MM-DD
  status: ActionStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  audit_trail: ActionAuditLog[];
};

type StoredFeedback = Record<string, unknown> & {
  id: string;
  created_at: string;
};

const ACTIONS_KEY = 'canteen:actions:list';
const FEEDBACK_KEY = 'canteen:feedback:list';

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

async function listActions(): Promise<ActionTakenEntry[]> {
  const redis = getRedis();
  try {
    const rows = await redis.lrange(ACTIONS_KEY, 0, 999);
    const seen = new Set<string>();
    const entries: ActionTakenEntry[] = [];

    for (const row of rows || []) {
      const entry = parseEntry<ActionTakenEntry>(row);
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }

    return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error('[actions] listActions error:', err);
    return [];
  }
}

async function syncFeedbacksWithAction(
  redis: Redis,
  feedbackIds: string[],
  actionData: {
    status: ActionStatus;
    action_description: string;
    responsible_person: string;
    action_date: string;
  }
) {
  try {
    const targetIds = new Set(feedbackIds);
    if (targetIds.size === 0) return;

    const rows = await redis.lrange(FEEDBACK_KEY, 0, 999);
    if (!rows || rows.length === 0) return;

    const updatedFeedbacks: StoredFeedback[] = [];
    let hasModifications = false;

    for (const row of rows) {
      const fb = parseEntry<StoredFeedback>(row);
      if (!fb?.id) continue;

      if (targetIds.has(fb.id)) {
        hasModifications = true;
        const isResolved = actionData.status === 'Closed' || actionData.status === 'Action Taken';
        updatedFeedbacks.push({
          ...fb,
          action_status: isResolved ? 'resolved' : 'pending',
          action_taken: actionData.action_description,
          action_by: actionData.responsible_person,
          action_at: actionData.action_date,
        });
      } else {
        updatedFeedbacks.push(fb);
      }
    }

    if (hasModifications) {
      await redis.del(FEEDBACK_KEY);
      for (const item of [...updatedFeedbacks].reverse()) {
        await redis.lpush(FEEDBACK_KEY, JSON.stringify(item));
      }
    }
  } catch (syncErr) {
    console.warn('[actions] syncFeedbacksWithAction error:', syncErr);
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const redis = getRedis();

    // 1. GET ALL ACTIONS
    if (req.method === 'GET') {
      const plantId = req.query?.plant_id ? String(req.query.plant_id).trim() : '';
      let actions = await listActions();
      if (plantId && plantId !== 'all') {
        actions = actions.filter((a) => a.plant_id === plantId);
      }
      return res.status(200).json({ ok: true, actions, count: actions.length });
    }

    // 2. CREATE NEW ACTION
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

      const {
        issue_title,
        plant_id,
        plant_name,
        feedback_ids = [],
        action_description,
        responsible_person = 'Canteen Operations',
        responsible_dept = 'HR & Admin',
        action_date = new Date().toISOString().split('T')[0],
        status = 'Action Taken',
        created_by = 'Admin',
        note,
      } = body;

      if (!issue_title || !action_description) {
        return res.status(400).json({ error: 'Issue title and action description are required' });
      }

      const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      const newAction: ActionTakenEntry = {
        id,
        issue_title: String(issue_title).trim(),
        plant_id: String(plant_id || '').trim(),
        plant_name: plant_name ? String(plant_name).trim() : undefined,
        feedback_ids: Array.isArray(feedback_ids) ? feedback_ids.map(String) : [],
        complaint_count: Array.isArray(feedback_ids) ? feedback_ids.length : 1,
        action_description: String(action_description).trim(),
        responsible_person: String(responsible_person).trim(),
        responsible_dept: String(responsible_dept).trim(),
        action_date: String(action_date),
        status: status as ActionStatus,
        created_at: now,
        updated_at: now,
        created_by: String(created_by).trim(),
        audit_trail: [
          {
            updated_by: String(created_by).trim(),
            updated_at: now,
            new_status: status as ActionStatus,
            note: note ? String(note).trim() : 'Action initiated and recorded',
          },
        ],
      };

      await redis.lpush(ACTIONS_KEY, JSON.stringify(newAction));

      // Sync with linked feedbacks
      if (newAction.feedback_ids.length > 0) {
        await syncFeedbacksWithAction(redis, newAction.feedback_ids, {
          status: newAction.status,
          action_description: newAction.action_description,
          responsible_person: newAction.responsible_person,
          action_date: newAction.action_date,
        });
      }

      return res.status(201).json({ ok: true, action: newAction });
    }

    // 3. UPDATE ACTION (Audit Log Captured)
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }
      body = body || {};

      const { id, updates, updated_by = 'Admin', note } = body;
      if (!id || !updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Action id and updates object required' });
      }

      const existingActions = await listActions();
      let updatedAction: ActionTakenEntry | null = null;

      const nextActions = existingActions.map((action) => {
        if (action.id === id) {
          const now = new Date().toISOString();
          const prevStatus = action.status;
          const nextStatus = updates.status || prevStatus;

          const auditEntry: ActionAuditLog = {
            updated_by: String(updated_by).trim(),
            updated_at: now,
            previous_status: prevStatus,
            new_status: nextStatus,
            note: note ? String(note).trim() : `Updated: ${Object.keys(updates).join(', ')}`,
          };

          updatedAction = {
            ...action,
            ...updates,
            updated_at: now,
            audit_trail: [auditEntry, ...(action.audit_trail || [])],
          };
          return updatedAction;
        }
        return action;
      });

      if (!updatedAction) {
        return res.status(404).json({ error: 'Action entry not found' });
      }

      await redis.del(ACTIONS_KEY);
      for (const item of [...nextActions].reverse()) {
        await redis.lpush(ACTIONS_KEY, JSON.stringify(item));
      }

      // Sync linked feedbacks
      if (updatedAction && Array.isArray((updatedAction as any).feedback_ids)) {
        await syncFeedbacksWithAction(redis, (updatedAction as any).feedback_ids, {
          status: (updatedAction as any).status,
          action_description: (updatedAction as any).action_description,
          responsible_person: (updatedAction as any).responsible_person,
          action_date: (updatedAction as any).action_date,
        });
      }

      return res.status(200).json({ ok: true, action: updatedAction });
    }

    // 4. DELETE ACTION
    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      body = body || {};

      const id = req.query?.id || body.id;
      if (!id) {
        return res.status(400).json({ error: 'Action id is required' });
      }

      const existingActions = await listActions();
      const filtered = existingActions.filter((a) => a.id !== id);

      await redis.del(ACTIONS_KEY);
      for (const item of [...filtered].reverse()) {
        await redis.lpush(ACTIONS_KEY, JSON.stringify(item));
      }

      return res.status(200).json({ ok: true, deleted: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[actions] API error:', error);
    return res.status(500).json({
      error: 'Failed to process action request',
      details: error?.message || String(error),
    });
  }
}
