import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

// ─── Types ───
type EmailTier = 'admin' | 'hr' | 'plant_head' | 'top_management';

type StoredFeedback = {
  id: string;
  language?: string;
  plant_id?: string;
  plant_name?: string;
  plant_code?: string;
  plant_location?: string;
  plant_display_name?: string;
  meal_type?: string;
  shift?: string;
  food_taste?: number;
  food_quality?: number;
  food_quantity?: number;
  cleanliness?: number;
  staff_behaviour?: number;
  service_speed?: number;
  hygiene?: number;
  overall_rating?: number;
  remark?: string;
  employee_name?: string;
  employee_id?: string;
  satisfaction_status?: 'satisfied' | 'unsatisfied';
  action_status?: 'pending' | 'resolved';
  action_taken?: string;
  action_by?: string;
  action_at?: string;
  created_at: string;
};

type StoredPlant = {
  id: string;
  name: string;
  code: string;
  location: string;
  display_name: string;
  is_active: boolean;
};

type EmailRecipientConfig = {
  id: string;
  tier: EmailTier;
  email: string;
  name?: string;
  plant_ids: string[];
  frequency: 'daily' | '7_days' | '15_days' | 'monthly';
  status: 'active' | 'inactive';
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
  action_date: string;
  status: 'Pending' | 'In Progress' | 'Action Taken' | 'Closed';
  created_at: string;
};

const FEEDBACK_KEY = 'canteen:feedback:list';
const SETTINGS_KEY = 'canteen:settings';
const PLANTS_KEY = 'canteen:plants';
const ACTIONS_KEY = 'canteen:actions:list';
const EMAIL_LOGS_KEY = 'canteen:email_logs:list';

const PLANTS_LOCAL_FALLBACK: StoredPlant[] = [
  { id: 'plant-1', name: 'PG TECHNOPLAST', code: '2040', location: 'BHIWADI', display_name: 'BHIWADI — PGTL (2040)', is_active: true },
  { id: 'plant-2', name: 'NEXT GENERATION MANUFACTURING', code: '4020', location: 'BHIWADI', display_name: 'BHIWADI — NGM (4020)', is_active: true },
];

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing Redis credentials');
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

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.office365.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || 'verify.software2040@pgel.in';
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || 'nsxfmjjkskdrbbtt';

  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false,
    },
  });
}

// ─── Deterministic IST Date Math (UTC + 5:30) ───
function getISTDate(timestampMs: number = Date.now()) {
  const istMs = timestampMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}

function formatISTDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${d}-${m}-${y}`;
}

// ─── Group Similar Unsatisfied Feedbacks & Actions ───
function buildGroupedActionReport(
  feedbacks: StoredFeedback[],
  actions: ActionTakenEntry[]
): {
  resolved: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }>;
  pending: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }>;
} {
  const resolvedList: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }> = [];
  const pendingList: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }> = [];

  const processedFeedbackIds = new Set<string>();

  // 1. Process explicit actions created by admin
  for (const act of actions) {
    const isResolved = act.status === 'Closed' || act.status === 'Action Taken';
    const entry = {
      issue: act.issue_title,
      count: act.complaint_count || (act.feedback_ids ? act.feedback_ids.length : 1),
      action_taken: act.action_description || 'Corrective action implemented',
      dept: act.responsible_dept || 'Canteen Operations',
      status: act.status,
      date: act.action_date || act.created_at?.split('T')[0] || '',
    };

    if (act.feedback_ids) {
      act.feedback_ids.forEach((id) => processedFeedbackIds.add(id));
    }

    if (isResolved) {
      resolvedList.push(entry);
    } else {
      pendingList.push(entry);
    }
  }

  // 2. Identify remaining unsatisfied feedbacks and group similar complaints
  const remainingUnsatisfied = feedbacks.filter(
    (f) =>
      !processedFeedbackIds.has(f.id) &&
      (f.satisfaction_status === 'unsatisfied' || (Number(f.overall_rating) || 0) <= 2)
  );

  // Group remaining by complaint category
  const clusters: Record<string, { count: number; sampleRemarks: string[]; hasAction: boolean; actionTaken?: string; actionBy?: string; actionDate?: string }> = {};

  for (const fb of remainingUnsatisfied) {
    let category = 'General Canteen Service Improvement';
    const remark = (fb.remark || '').toLowerCase();

    if ((fb.food_taste && fb.food_taste <= 2) || remark.includes('taste') || remark.includes('spicy') || remark.includes('salt') || remark.includes('masala')) {
      category = 'Food Taste & Seasoning Quality';
    } else if ((fb.food_quality && fb.food_quality <= 2) || remark.includes('raw') || remark.includes('kacha') || remark.includes('quality') || remark.includes('oil')) {
      category = 'Ingredient Freshness & Cooking Standards';
    } else if ((fb.food_quantity && fb.food_quantity <= 2) || remark.includes('portion') || remark.includes('kam') || remark.includes('quantity')) {
      category = 'Food Portion Size & Serving Availability';
    } else if ((fb.hygiene && fb.hygiene <= 2) || (fb.cleanliness && fb.cleanliness <= 2) || remark.includes('clean') || remark.includes('plate') || remark.includes('table') || remark.includes('fly')) {
      category = 'Dining Area & Utensil Hygiene / Sanitation';
    } else if ((fb.staff_behaviour && fb.staff_behaviour <= 2) || (fb.service_speed && fb.service_speed <= 2) || remark.includes('slow') || remark.includes('staff') || remark.includes('line')) {
      category = 'Serving Speed & Counter Staff Professionalism';
    } else if (fb.remark && fb.remark.trim().length > 3) {
      category = fb.remark.trim().length > 40 ? `${fb.remark.trim().slice(0, 37)}...` : fb.remark.trim();
    }

    if (!clusters[category]) {
      clusters[category] = {
        count: 0,
        sampleRemarks: [],
        hasAction: Boolean(fb.action_taken),
        actionTaken: fb.action_taken,
        actionBy: fb.action_by,
        actionDate: fb.action_at,
      };
    }

    clusters[category].count += 1;
    if (fb.remark && clusters[category].sampleRemarks.length < 2) {
      clusters[category].sampleRemarks.push(fb.remark);
    }
  }

  // Convert clusters into report rows
  for (const [category, data] of Object.entries(clusters)) {
    if (data.hasAction && data.actionTaken) {
      resolvedList.push({
        issue: category,
        count: data.count,
        action_taken: data.actionTaken,
        dept: data.actionBy || 'Canteen Operations',
        status: 'Action Taken',
        date: data.actionDate ? data.actionDate.split('T')[0] : '',
      });
    } else {
      pendingList.push({
        issue: category,
        count: data.count,
        action_taken: 'Under Review by Canteen Committee',
        dept: 'Canteen & HR Dept',
        status: 'Pending',
        date: '-',
      });
    }
  }

  return { resolved: resolvedList, pending: pendingList };
}

// ─── Professional Corporate Email HTML Builder ───
function buildManagementReportHtml(params: {
  tier: EmailTier;
  recipientName?: string;
  plantNames: string;
  reportingPeriod: string;
  totalFeedback: number;
  satisfiedCount: number;
  satisfiedPct: number;
  unsatisfiedCount: number;
  unsatisfiedPct: number;
  plantBreakdown?: Array<{
    plantName: string;
    total: number;
    satisfiedPct: number;
    unsatisfiedPct: number;
  }>;
  topUnsatisfied: StoredFeedback[];
  actionReport: {
    resolved: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }>;
    pending: Array<{ issue: string; count: number; action_taken: string; dept: string; status: string; date: string }>;
  };
}): string {
  const {
    tier,
    recipientName = 'Sir / Ma\'am',
    plantNames,
    reportingPeriod,
    totalFeedback,
    satisfiedCount,
    satisfiedPct,
    unsatisfiedCount,
    unsatisfiedPct,
    plantBreakdown = [],
    topUnsatisfied,
    actionReport,
  } = params;

  const tierTitles: Record<EmailTier, { badge: string; color: string; desc: string }> = {
    admin: { badge: 'DAILY OPERATIONAL REPORT', color: '#0284C7', desc: 'Daily feedback summary for assigned plant operations.' },
    hr: { badge: '7-DAY HR QUALITY AUDIT', color: '#7C3AED', desc: 'Weekly canteen satisfaction & action taken audit report.' },
    plant_head: { badge: '15-DAY EXECUTIVE REVIEW', color: '#059669', desc: 'Bi-weekly plant-level operational review & action compliance.' },
    top_management: { badge: 'MONTHLY EXECUTIVE DIGEST', color: '#DC2626', desc: 'Corporate-wide monthly canteen quality & grievance digest.' },
  };

  const meta = tierTitles[tier] || tierTitles.admin;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canteen Feedback Management Report</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 26px 28px; color: #FFFFFF; border-bottom: 4px solid ${meta.color};">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <div style="display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #38BDF8; background-color: rgba(56, 189, 248, 0.12); padding: 4px 10px; border-radius: 6px; margin-bottom: 8px;">
              ${meta.badge}
            </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.3px; color: #FFFFFF;">
              Canteen Feedback Management Report
            </h1>
            <div style="font-size: 13px; color: #94A3B8; margin-top: 4px;">
              ${plantNames} • Reporting Period: <strong style="color: #F8FAFC;">${reportingPeriod}</strong>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Main Content Area -->
    <div style="padding: 24px 28px;">
      
      <p style="font-size: 14px; line-height: 1.5; color: #334155; margin: 0 0 18px 0;">
        Dear <strong>${recipientName}</strong>,<br>
        Please find below the consolidated canteen feedback and action compliance review for <strong>${plantNames}</strong> during <strong>${reportingPeriod}</strong>.
      </p>

      <!-- KPI Summary Cards -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
        <tr>
          <td width="24%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 10px; text-align: center;">
            <div style="font-size: 22px; font-weight: 900; color: #0F172A;">${totalFeedback}</div>
            <div style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-top: 4px;">Total Feedback</div>
          </td>
          <td width="2%"></td>
          <td width="24%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 14px 10px; text-align: center;">
            <div style="font-size: 22px; font-weight: 900; color: #16A34A;">${satisfiedCount}</div>
            <div style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; margin-top: 4px;">Satisfied (${satisfiedPct}%)</div>
          </td>
          <td width="2%"></td>
          <td width="24%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 14px 10px; text-align: center;">
            <div style="font-size: 22px; font-weight: 900; color: #DC2626;">${unsatisfiedCount}</div>
            <div style="font-size: 10px; font-weight: 800; color: #B91C1C; text-transform: uppercase; margin-top: 4px;">Unsatisfied (${unsatisfiedPct}%)</div>
          </td>
          <td width="2%"></td>
          <td width="24%" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 14px 10px; text-align: center;">
            <div style="font-size: 22px; font-weight: 900; color: #2563EB;">${satisfiedPct}%</div>
            <div style="font-size: 10px; font-weight: 800; color: #1D4ED8; text-transform: uppercase; margin-top: 4px;">Satisfaction Score</div>
          </td>
        </tr>
      </table>

      ${
        plantBreakdown.length > 1
          ? `
        <!-- Plant-Wise Summary Table (Multi-Plant / Top Management) -->
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0F172A; margin: 0 0 10px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">
            🏢 Plant-Wise Performance Summary
          </h2>
          <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; border: 1px solid #E2E8F0;">
            <tr style="background-color: #F8FAFC; color: #475569; font-weight: 800; text-align: left; border-bottom: 1px solid #E2E8F0;">
              <th>Plant Name</th>
              <th style="text-align: center;">Responses</th>
              <th style="text-align: center;">Satisfied %</th>
              <th style="text-align: center;">Unsatisfied %</th>
              <th style="text-align: center;">Status</th>
            </tr>
            ${plantBreakdown
              .map(
                (p) => `
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="font-weight: 700; color: #1E293B;">${p.plantName}</td>
                <td style="text-align: center; font-weight: 700;">${p.total}</td>
                <td style="text-align: center; color: #16A34A; font-weight: 700;">${p.satisfiedPct}%</td>
                <td style="text-align: center; color: #DC2626; font-weight: 700;">${p.unsatisfiedPct}%</td>
                <td style="text-align: center;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; background-color: ${
                    p.unsatisfiedPct > 20 ? '#FEE2E2; color: #991B1B;' : '#DCFCE7; color: #166534;'
                  }">
                    ${p.unsatisfiedPct > 20 ? 'Action Needed' : 'Normal'}
                  </span>
                </td>
              </tr>
            `
              )
              .join('')}
          </table>
        </div>
      `
          : ''
      }

      <!-- Action Report Table (Required Format) -->
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0F172A; margin: 0 0 10px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">
          🛠️ Action Taken &amp; Issue Resolution Management
        </h2>

        <!-- Section 1: Resolved / Action Taken -->
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-weight: 800; color: #15803D; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <span>✅ Resolved / Action Taken (${actionReport.resolved.length})</span>
          </div>
          ${
            actionReport.resolved.length === 0
              ? `<div style="font-size: 11px; color: #94A3B8; font-style: italic; padding: 6px 0;">No resolved actions recorded for this cycle.</div>`
              : `
            <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 11px; border: 1px solid #DCFCE7;">
              <tr style="background-color: #F0FDF4; color: #166534; font-weight: 800; text-align: left; border-bottom: 1px solid #BBF7D0;">
                <th style="width: 32%;">Issue / Feedback</th>
                <th style="width: 8%; text-align: center;">Count</th>
                <th style="width: 30%;">Action Taken</th>
                <th style="width: 15%;">Responsible Dept.</th>
                <th style="width: 8%; text-align: center;">Status</th>
                <th style="width: 7%; text-align: center;">Date</th>
              </tr>
              ${actionReport.resolved
                .map(
                  (r) => `
                <tr style="border-bottom: 1px solid #E2E8F0;">
                  <td style="font-weight: 700; color: #1E293B;">${r.issue}</td>
                  <td style="text-align: center; font-weight: 800; color: #0F172A;">${r.count}</td>
                  <td style="color: #15803D; font-weight: 600;">${r.action_taken}</td>
                  <td style="color: #475569;">${r.dept}</td>
                  <td style="text-align: center;">
                    <span style="background-color: #DCFCE7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px;">${r.status}</span>
                  </td>
                  <td style="text-align: center; color: #64748B;">${r.date || '-'}</td>
                </tr>
              `
                )
                .join('')}
            </table>
          `
          }
        </div>

        <!-- Section 2: Pending Issues -->
        <div>
          <div style="font-size: 11px; font-weight: 800; color: #B91C1C; text-transform: uppercase; margin-bottom: 6px;">
            ⚠️ Pending / Under Review Issues (${actionReport.pending.length})
          </div>
          ${
            actionReport.pending.length === 0
              ? `<div style="font-size: 11px; color: #16A34A; font-weight: 700; padding: 6px 0;">🎉 All logged feedback issues currently have actions assigned!</div>`
              : `
            <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 11px; border: 1px solid #FEE2E2;">
              <tr style="background-color: #FEF2F2; color: #991B1B; font-weight: 800; text-align: left; border-bottom: 1px solid #FECACA;">
                <th style="width: 32%;">Issue / Feedback</th>
                <th style="width: 8%; text-align: center;">Count</th>
                <th style="width: 30%;">Action Taken</th>
                <th style="width: 15%;">Responsible Dept.</th>
                <th style="width: 8%; text-align: center;">Status</th>
                <th style="width: 7%; text-align: center;">Date</th>
              </tr>
              ${actionReport.pending
                .map(
                  (p) => `
                <tr style="border-bottom: 1px solid #E2E8F0;">
                  <td style="font-weight: 700; color: #1E293B;">${p.issue}</td>
                  <td style="text-align: center; font-weight: 800; color: #DC2626;">${p.count}</td>
                  <td style="color: #64748B; font-style: italic;">${p.action_taken}</td>
                  <td style="color: #475569;">${p.dept}</td>
                  <td style="text-align: center;">
                    <span style="background-color: #FEE2E2; color: #991B1B; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px;">${p.status}</span>
                  </td>
                  <td style="text-align: center; color: #64748B;">${p.date || '-'}</td>
                </tr>
              `
                )
                .join('')}
            </table>
          `
          }
        </div>
      </div>

      <!-- Top Unsatisfied Feedbacks Summary -->
      ${
        topUnsatisfied.length > 0
          ? `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0F172A; margin: 0 0 10px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">
            ⚠️ Top Unsatisfied Feedback Details (Up to 10)
          </h2>
          <table width="100%" cellpadding="8" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 11px; border: 1px solid #E2E8F0;">
            <tr style="background-color: #F8FAFC; color: #475569; font-weight: 800; text-align: left; border-bottom: 1px solid #E2E8F0;">
              <th>Employee / Shift</th>
              <th>Rating</th>
              <th>Specific Remarks &amp; Low Scores</th>
              <th>Action Taken</th>
            </tr>
            ${topUnsatisfied
              .slice(0, 10)
              .map((item) => {
                const lowParams = [
                  item.food_taste && item.food_taste <= 2 ? `Taste: ${item.food_taste}★` : '',
                  item.food_quality && item.food_quality <= 2 ? `Quality: ${item.food_quality}★` : '',
                  item.food_quantity && item.food_quantity <= 2 ? `Portion: ${item.food_quantity}★` : '',
                  item.hygiene && item.hygiene <= 2 ? `Hygiene: ${item.hygiene}★` : '',
                  item.staff_behaviour && item.staff_behaviour <= 2 ? `Staff: ${item.staff_behaviour}★` : '',
                ]
                  .filter(Boolean)
                  .join(' • ');

                return `
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="color: #1E293B;">
                    <strong>${item.employee_name || 'Anonymous'}</strong><br>
                    <span style="color: #64748B; font-size: 10px;">${item.employee_id ? item.employee_id + ' • ' : ''}${item.meal_type || 'Meal'}</span>
                  </td>
                  <td>
                    <span style="display: inline-block; background-color: #FEE2E2; color: #DC2626; font-weight: 800; padding: 2px 6px; border-radius: 4px;">
                      ${item.overall_rating || 1} / 5 ★
                    </span>
                  </td>
                  <td>
                    <div style="font-weight: 600; color: #0F172A;">"${item.remark || 'Low rating provided without remarks'}"</div>
                    ${lowParams ? `<div style="font-size: 10px; color: #DC2626; margin-top: 2px;">Issues: ${lowParams}</div>` : ''}
                  </td>
                  <td>
                    ${
                      item.action_taken
                        ? `<span style="color: #166534; font-weight: 700; font-size: 10px;">✅ ${item.action_taken}</span>`
                        : `<span style="color: #DC2626; font-size: 10px; font-weight: 700;">Pending</span>`
                    }
                  </td>
                </tr>
              `;
              })
              .join('')}
          </table>
        </div>
      `
          : ''
      }

      <!-- Admin Action Callout Button -->
      <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 10px; padding: 16px; text-align: center; margin-top: 20px;">
        <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">
          Need to group complaints, assign responsible teams, or update action taken?
        </div>
        <a href="https://canteen-feedback-portal.vercel.app" style="display: inline-block; background-color: #0284C7; color: #FFFFFF; font-size: 12px; font-weight: 800; padding: 8px 18px; border-radius: 6px; text-decoration: none;">
          Open Canteen Action Management Portal →
        </a>
      </div>

    </div>

    <!-- Corporate Footer -->
    <div style="background-color: #0F172A; color: #94A3B8; padding: 18px 28px; text-align: center; font-size: 11px; border-top: 1px solid #1E293B;">
      <div style="font-weight: 700; color: #F8FAFC; margin-bottom: 4px;">PG Electroplast Ltd — Canteen Quality &amp; Grievance System</div>
      <div>Confidential Operational Communication. Recipient mapped to assigned plant access only.</div>
    </div>

  </div>
</body>
</html>
  `;
}

// ─── Main Dispatcher Handler ───
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const isTestMode = body.is_test === true || req.query?.test === 'true';
    const forceSend = body.force === true || isTestMode;
    const requestedTier = (body.tier || req.query?.tier || '') as EmailTier | '';
    const requestedEmail = body.email || body.test_email || '';
    const requestedPlantId = body.plant_id ? String(body.plant_id).trim() : '';

    const redis = getRedis();

    // 1. Fetch system settings
    const rawSettings = await redis.get(SETTINGS_KEY);
    const settings = rawSettings
      ? typeof rawSettings === 'string'
        ? JSON.parse(rawSettings)
        : rawSettings
      : {};

    const emailTiersConfig = settings.email_tiers || {
      enabled: true,
      scheduled_time: '20:00',
      admin_emails: [
        { id: 'cfg-adm-1', tier: 'admin', email: 'software.2040@pgel.in', name: 'IT Admin', plant_ids: ['plant-1'], frequency: 'daily', status: 'active' },
      ],
      hr_emails: [
        { id: 'cfg-hr-1', tier: 'hr', email: 'hr.bhiwadi@pgel.in', name: 'HR Lead', plant_ids: ['plant-1'], frequency: '7_days', status: 'active' },
      ],
      plant_head_emails: [
        { id: 'cfg-ph-1', tier: 'plant_head', email: 'planthead.2040@pgel.in', name: 'Plant Head', plant_ids: ['plant-1'], frequency: '15_days', status: 'active' },
      ],
      top_management_emails: [
        { id: 'cfg-tm-1', tier: 'top_management', email: 'management@pgel.in', name: 'Management', plant_ids: ['all'], frequency: 'monthly', status: 'active' },
      ],
    };

    if (emailTiersConfig.enabled === false && !forceSend) {
      return res.status(200).json({ ok: true, message: 'Automated email system is disabled in settings', sent: 0 });
    }

    // 2. Fetch Plants
    let plantsList: StoredPlant[] = PLANTS_LOCAL_FALLBACK;
    try {
      const rawPlants = await redis.get(PLANTS_KEY);
      if (rawPlants) {
        const parsed = typeof rawPlants === 'string' ? JSON.parse(rawPlants) : rawPlants;
        if (Array.isArray(parsed) && parsed.length > 0) {
          plantsList = parsed.filter((p: any) => p && p.is_active !== false);
        }
      }
    } catch (e) {
      console.warn('[daily-digest] Using fallback plants:', e);
    }

    const plantsMap = new Map<string, StoredPlant>();
    plantsList.forEach((p) => plantsMap.set(p.id, p));

    // 3. Fetch All Feedbacks
    const rows = await redis.lrange(FEEDBACK_KEY, 0, 999);
    const allFeedbacks: StoredFeedback[] = [];
    for (const row of rows || []) {
      const entry = parseEntry<StoredFeedback>(row);
      if (entry?.id) allFeedbacks.push(entry);
    }

    // 4. Fetch Actions
    const actionRows = await redis.lrange(ACTIONS_KEY, 0, 999);
    const allActions: ActionTakenEntry[] = [];
    for (const row of actionRows || []) {
      const act = parseEntry<ActionTakenEntry>(row);
      if (act?.id) allActions.push(act);
    }

    // Current IST Time calculation
    const nowIST = getISTDate();
    const currentHour = nowIST.getUTCHours();
    const currentMinute = nowIST.getUTCMinutes();
    const currentDayOfMonth = nowIST.getUTCDate();
    const currentDayOfWeek = nowIST.getUTCDay(); // 0 = Sunday, 1 = Monday
    const todayDateKey = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIST.getUTCDate()).padStart(2, '0')}`;

    const isVercelCron =
      req.headers['x-vercel-cron'] === '1' ||
      (typeof req.headers['user-agent'] === 'string' && req.headers['user-agent'].includes('vercel-cron'));

    // Check scheduled time if run via client ping (allow 15-minute window or force)
    if (!forceSend && !isTestMode && !isVercelCron) {
      const [schedH = '20', schedM = '00'] = (emailTiersConfig.scheduled_time || '20:00').split(':');
      const targetMin = parseInt(schedH, 10) * 60 + parseInt(schedM, 10);
      const currMin = currentHour * 60 + currentMinute;
      if (currMin < targetMin) {
        return res.status(200).json({
          ok: true,
          message: `Current IST time (${currentHour}:${currentMinute}) is before scheduled dispatch time (${emailTiersConfig.scheduled_time || '20:00'}).`,
          sent: 0,
        });
      }
    }

    const transporter = getTransporter();
    const dispatchedResults: Array<any> = [];

    // Helper to log delivery to Redis
    async function recordDeliveryLog(log: {
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
    }) {
      try {
        const entry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          ...log,
        };
        await redis.lpush(EMAIL_LOGS_KEY, JSON.stringify(entry));
        await redis.ltrim(EMAIL_LOGS_KEY, 0, 500);
      } catch (err) {
        console.warn('[daily-digest] Failed to record log:', err);
      }
    }

    // ─── Dispatch Function for a Single Recipient ───
    async function processRecipient(recipient: EmailRecipientConfig, targetTier: EmailTier) {
      const { email, plant_ids = [], frequency } = recipient;
      if (!email || recipient.status === 'inactive') return;

      // Filter plants accessible to this recipient
      let mappedPlants: StoredPlant[] = [];
      const hasAllAccess = plant_ids.includes('all');

      if (hasAllAccess) {
        mappedPlants = plantsList;
      } else {
        mappedPlants = plantsList.filter((p) => plant_ids.includes(p.id) || plant_ids.includes(p.code));
      }

      if (requestedPlantId && isTestMode) {
        mappedPlants = mappedPlants.filter((p) => p.id === requestedPlantId || p.code === requestedPlantId);
      }

      if (mappedPlants.length === 0) return;

      // Determine Reporting Period & Milliseconds
      let periodMs = 24 * 60 * 60 * 1000; // 1 day default (Admin)
      let periodLabel = 'Previous Day';

      if (targetTier === 'hr' || frequency === '7_days') {
        periodMs = 7 * 24 * 60 * 60 * 1000;
        periodLabel = 'Last 7 Days';
      } else if (targetTier === 'plant_head' || frequency === '15_days') {
        periodMs = 15 * 24 * 60 * 60 * 1000;
        periodLabel = 'Last 15 Days';
      } else if (targetTier === 'top_management' || frequency === 'monthly') {
        periodMs = 30 * 24 * 60 * 60 * 1000;
        periodLabel = 'Last 30 Days (Monthly)';
      }

      // Check Automated Frequency Condition (unless forced or test)
      if (!forceSend && !isTestMode) {
        if (targetTier === 'hr' && currentDayOfWeek !== 1) {
          // Send HR only on Mondays
          return;
        }
        if (targetTier === 'plant_head' && currentDayOfMonth !== 1 && currentDayOfMonth !== 16) {
          // Send Plant Head on 1st & 16th of month
          return;
        }
        if (targetTier === 'top_management' && currentDayOfMonth !== 1) {
          // Send Top Management on 1st of month
          return;
        }
      }

      // Deduplication check
      const sentKey = `canteen:mail:sent:${targetTier}:${email}:${todayDateKey}`;
      if (!forceSend && !isTestMode) {
        const alreadySent = await redis.get(sentKey);
        if (alreadySent) {
          console.log(`[daily-digest] Already sent ${targetTier} email to ${email} today.`);
          return;
        }
      }

      // Filter feedbacks belonging ONLY to mapped plants within the reporting period
      const cutoffTime = Date.now() - periodMs;
      const allowedPlantIds = new Set(mappedPlants.map((p) => p.id));
      const allowedPlantCodes = new Set(mappedPlants.map((p) => p.code.toLowerCase()));

      const relevantFeedbacks = allFeedbacks.filter((f) => {
        const fbTime = new Date(String(f.created_at)).getTime();
        if (fbTime < cutoffTime) return false;

        const pId = f.plant_id || '';
        const pCode = (f.plant_code || '').toLowerCase();
        return allowedPlantIds.has(pId) || allowedPlantCodes.has(pCode);
      });

      // Filter actions belonging ONLY to mapped plants
      const relevantActions = allActions.filter((a) => {
        return allowedPlantIds.has(a.plant_id);
      });

      // Compute Metrics
      const totalFeedback = relevantFeedbacks.length;
      const satisfiedList = relevantFeedbacks.filter((f) => (Number(f.overall_rating) || 0) >= 3);
      const satisfiedCount = satisfiedList.length;
      const unsatisfiedCount = totalFeedback - satisfiedCount;
      const satisfiedPct = totalFeedback > 0 ? Math.round((satisfiedCount / totalFeedback) * 100) : 0;
      const unsatisfiedPct = totalFeedback > 0 ? Math.round((unsatisfiedCount / totalFeedback) * 100) : 0;

      // Top Unsatisfied Feedbacks (sorted by lowest rating and remarks)
      const topUnsatisfied = relevantFeedbacks
        .filter((f) => f.satisfaction_status === 'unsatisfied' || (Number(f.overall_rating) || 0) <= 2)
        .sort((a, b) => {
          const rA = Number(a.overall_rating) || 0;
          const rB = Number(b.overall_rating) || 0;
          if (rA !== rB) return rA - rB;
          return (b.remark ? 1 : 0) - (a.remark ? 1 : 0);
        })
        .slice(0, 10);

      // Grouped Action Report
      const actionReport = buildGroupedActionReport(relevantFeedbacks, relevantActions);

      // Plant-wise Breakdown (for Top Management or multi-plant)
      const plantBreakdown = mappedPlants.map((p) => {
        const pFeedbacks = relevantFeedbacks.filter((f) => f.plant_id === p.id || (f.plant_code && f.plant_code === p.code));
        const pTotal = pFeedbacks.length;
        const pSat = pFeedbacks.filter((f) => (Number(f.overall_rating) || 0) >= 3).length;
        const pSatPct = pTotal > 0 ? Math.round((pSat / pTotal) * 100) : 0;
        const pUnsatPct = pTotal > 0 ? 100 - pSatPct : 0;

        return {
          plantName: p.display_name || `${p.name} (${p.code})`,
          total: pTotal,
          satisfiedPct: pSatPct,
          unsatisfiedPct: pUnsatPct,
        };
      });

      const plantNamesStr =
        mappedPlants.length === 1
          ? mappedPlants[0].display_name || mappedPlants[0].name
          : hasAllAccess
          ? 'All PG Group Plants'
          : mappedPlants.map((p) => p.name).join(', ');

      const html = buildManagementReportHtml({
        tier: targetTier,
        recipientName: recipient.name || 'Executive',
        plantNames: plantNamesStr,
        reportingPeriod: periodLabel,
        totalFeedback,
        satisfiedCount,
        satisfiedPct,
        unsatisfiedCount,
        unsatisfiedPct,
        plantBreakdown,
        topUnsatisfied,
        actionReport,
      });

      const subject =
        targetTier === 'admin'
          ? `Daily Canteen Feedback Report - ${plantNamesStr} (${formatISTDateStr(nowIST)})`
          : targetTier === 'hr'
          ? `7-Day HR Canteen Quality & Action Audit - ${plantNamesStr}`
          : targetTier === 'plant_head'
          ? `15-Day Plant Head Canteen Management Review - ${plantNamesStr}`
          : `Monthly Canteen Performance & Action Review - ${plantNamesStr}`;

      const destinationEmail = requestedEmail && isTestMode ? requestedEmail : email;

      try {
        const sendResult = await transporter.sendMail({
          from: `"Canteen Management System" <verify.software2040@pgel.in>`,
          to: destinationEmail,
          subject: isTestMode ? `[TEST] ${subject}` : subject,
          html,
        });

        // Set sent lock in Redis (24h TTL)
        if (!forceSend && !isTestMode) {
          await redis.set(sentKey, new Date().toISOString(), { ex: 86400 });
        }

        await recordDeliveryLog({
          tier: targetTier,
          recipient_email: destinationEmail,
          recipient_name: recipient.name,
          plant_id: mappedPlants.length === 1 ? mappedPlants[0].id : 'all',
          plant_name: plantNamesStr,
          reporting_period: periodLabel,
          feedbacks_count: totalFeedback,
          satisfied_count: satisfiedCount,
          unsatisfied_count: unsatisfiedCount,
          status: 'success',
          message_id: sendResult.messageId,
          subject,
        });

        dispatchedResults.push({
          tier: targetTier,
          email: destinationEmail,
          plant: plantNamesStr,
          status: 'sent',
          messageId: sendResult.messageId,
        });
      } catch (sendErr: any) {
        console.error(`[daily-digest] Failed to send ${targetTier} mail to ${destinationEmail}:`, sendErr);

        await recordDeliveryLog({
          tier: targetTier,
          recipient_email: destinationEmail,
          recipient_name: recipient.name,
          plant_id: mappedPlants.length === 1 ? mappedPlants[0].id : 'all',
          plant_name: plantNamesStr,
          reporting_period: periodLabel,
          feedbacks_count: totalFeedback,
          satisfied_count: satisfiedCount,
          unsatisfied_count: unsatisfiedCount,
          status: 'failed',
          error_message: sendErr?.message || String(sendErr),
          subject,
        });

        dispatchedResults.push({
          tier: targetTier,
          email: destinationEmail,
          plant: plantNamesStr,
          status: 'failed',
          error: sendErr?.message || String(sendErr),
        });
      }
    }

    // ─── Execute Dispatches for Required Tiers ───
    const tiersToRun: EmailTier[] = requestedTier
      ? [requestedTier]
      : ['admin', 'hr', 'plant_head', 'top_management'];

    for (const tier of tiersToRun) {
      let recipientList: EmailRecipientConfig[] = [];
      if (tier === 'admin') recipientList = emailTiersConfig.admin_emails || [];
      else if (tier === 'hr') recipientList = emailTiersConfig.hr_emails || [];
      else if (tier === 'plant_head') recipientList = emailTiersConfig.plant_head_emails || [];
      else if (tier === 'top_management') recipientList = emailTiersConfig.top_management_emails || [];

      // If specific recipient requested for test
      if (body.recipient_id) {
        recipientList = recipientList.filter((r) => r.id === body.recipient_id);
      }

      // If test email given directly without stored config
      if (recipientList.length === 0 && isTestMode && requestedEmail) {
        recipientList = [
          {
            id: 'temp-test',
            tier,
            email: requestedEmail,
            name: 'Test Recipient',
            plant_ids: requestedPlantId ? [requestedPlantId] : ['plant-1'],
            frequency: 'daily',
            status: 'active',
          },
        ];
      }

      for (const recipient of recipientList) {
        await processRecipient(recipient, tier);
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Processed 4-tier email dispatches. Total dispatched: ${dispatchedResults.length}`,
      dispatched: dispatchedResults,
    });
  } catch (error: any) {
    console.error('[daily-digest] Top-level handler error:', error);
    return res.status(500).json({
      error: 'Failed to process canteen management emails',
      details: error?.message || String(error),
    });
  }
}
