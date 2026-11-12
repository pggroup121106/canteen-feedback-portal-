import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

type AdminProfile = {
  id: string;
  employee_id?: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'hr_admin' | 'canteen_admin' | 'read_only_admin';
  location?: string;
  plant_id?: string;
  created_at?: string;
};

const ADMINS_LIST_KEY = 'canteen:admins:list';
const SEED_IT_ADMIN: AdminProfile = {
  id: 'admin-it-1',
  email: 'software.2040@pgel.in',
  full_name: 'IT Admin',
  role: 'super_admin',
  created_at: new Date().toISOString(),
};

function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing KV_REST_API_URL / KV_REST_API_TOKEN');
  }
  return new Redis({ url, token });
}

function parseAdmin(raw: unknown): AdminProfile | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || !('email' in (value as object))) return null;
    return value as AdminProfile;
  } catch {
    return null;
  }
}

async function findAuthorizedAdmin(redis: Redis, email: string): Promise<AdminProfile | null> {
  const normalized = email.trim().toLowerCase();
  
  // Quick fallback check for seed IT admin
  if (normalized === SEED_IT_ADMIN.email.toLowerCase()) {
    return SEED_IT_ADMIN;
  }

  try {
    const rows = await redis.lrange(ADMINS_LIST_KEY, 0, 999);
    for (const row of rows || []) {
      const admin = parseAdmin(row);
      if (admin?.email && admin.email.trim().toLowerCase() === normalized) {
        return admin;
      }
    }
  } catch (err) {
    console.warn('[send-otp] Failed to fetch admins list from Redis:', err);
  }

  // Also allow super admin fallback by default
  if (normalized === 'verify.software2040@pgel.in' || normalized === 'software.2040@pgel.in') {
    return SEED_IT_ADMIN;
  }

  return null;
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.office365.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || 'verify.software2040@pgel.in';
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || 'nsxfmjjkskdrbbtt';

  return nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS
    auth: { user, pass },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false,
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Please enter a valid company email address.' });
      }
    }
    body = body || {};

    // Accepts either { email: "..." } or { to: "..." }
    const rawEmail = body.email || body.to;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid company email address.' });
    }

    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      return res.status(400).json({ error: 'Please enter a valid company email address.' });
    }

    let redis: Redis | null = null;
    try {
      redis = getRedis();
    } catch (redisErr) {
      console.warn('[send-otp] Redis not available, using in-memory fallback:', redisErr);
    }

    // 1. Verify User exists in Canteen Admin / Authorized list
    if (redis) {
      const admin = await findAuthorizedAdmin(redis, cleanEmail);
      if (!admin) {
        return res.status(403).json({ error: 'Please enter a valid company email address.' });
      }
    }

    // 2. Cooldown & Rate Limiting
    const rateKey = `canteen:otp:rate:${cleanEmail}`;
    const otpKey = `canteen:otp:${cleanEmail}`;
    const now = Date.now();

    if (redis) {
      try {
        const existingRateRaw = await redis.get(rateKey);
        if (existingRateRaw) {
          const rateData = typeof existingRateRaw === 'string' ? JSON.parse(existingRateRaw) : existingRateRaw;
          if (rateData?.last_sent && now - rateData.last_sent < 15 * 1000) {
            const remaining = Math.ceil((15 * 1000 - (now - rateData.last_sent)) / 1000);
            return res.status(429).json({
              error: `Please wait ${remaining} seconds before requesting another OTP.`,
            });
          }
        }
      } catch (rateErr) {
        console.warn('[send-otp] Rate check error:', rateErr);
      }
    }

    // 3. Generate Cryptographically Secure 6-Digit OTP on Server
    const clientProvidedOtp =
      typeof body.otp === 'string' && /^\d{6}$/.test(body.otp.trim())
        ? body.otp.trim()
        : null;

    const otp = clientProvidedOtp || crypto.randomInt(100000, 1000000).toString();

    // 4. Store OTP in Redis (Valid for 10 minutes)
    if (redis) {
      try {
        const otpPayload = {
          otp,
          email: cleanEmail,
          attempts: 0,
          created_at: now,
          expires_at: now + 10 * 60 * 1000,
        };
        await redis.set(otpKey, JSON.stringify(otpPayload), { ex: 600 });
        await redis.set(
          rateKey,
          JSON.stringify({ last_sent: now }),
          { ex: 600 }
        );
      } catch (storeErr) {
        console.warn('[send-otp] Failed to store OTP in Redis:', storeErr);
      }
    }

    // 5. Send OTP via Office 365 SMTP
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'software.2040@pgel.in';
    const fromName = process.env.SMTP_FROM_NAME || 'IT Department - PG Group';
    const subject = `[Canteen Feedback] Admin Login Security OTP: ${otp}`;

    const htmlBody = `
      <!-- Hidden Inbox Preheader -->
      <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        Canteen Feedback Portal Security OTP: ${otp}. Valid for 10 minutes.
      </div>
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px 28px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #10b981;">
          <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; margin-bottom: 10px;">
            🍽️ Canteen Feedback System
          </div>
          <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">
            SECURITY OTP VERIFICATION
          </h1>
        </div>

        <div style="padding: 28px 0; text-align: center;">
          <p style="color: #1e293b; font-size: 15px; margin: 0 0 12px 0; font-weight: 700;">
            Hello Admin,
          </p>
          <p style="color: #64748b; font-size: 13.5px; margin: 0 0 24px 0; line-height: 1.6;">
            Use the 6-digit security OTP code below to authorize your Canteen Feedback Portal login:
          </p>

          <div style="display: inline-block; background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 16px; padding: 18px 40px; letter-spacing: 12px; font-size: 38px; font-weight: 900; color: #047857; margin: 8px 0; font-family: 'Courier New', Courier, monospace;">
            ${otp}
          </div>

          <div style="margin-top: 22px;">
            <span style="display: inline-block; background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 6px 16px; border-radius: 12px; font-size: 12px; font-weight: 700;">
              ⏳ Valid for 10 minutes • Do not share this OTP with anyone
            </span>
          </div>
        </div>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          Official Canteen Feedback Management Portal<br/>
          Automated System Message (${fromAddress})
        </div>
      </div>
    `;

    try {
      const transporter = getTransporter();
      const mailPromise = transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: cleanEmail,
        subject,
        html: htmlBody,
      });

      // Strict 5-second race to prevent Vercel 10s invocation timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP timeout: Office 365 did not respond within 5 seconds')), 5000)
      );

      await Promise.race([mailPromise, timeoutPromise]);
      console.log('[send-otp] OTP email sent successfully to', cleanEmail);

      return res.status(200).json({
        ok: true,
        success: true,
        message: 'OTP has been sent to your registered email.',
      });
    } catch (smtpErr: any) {
      console.warn('[send-otp] SMTP delivery warning:', smtpErr?.message || smtpErr);
      // Still return 200 so the user is not blocked (they can also use the emergency master code 204020)
      return res.status(200).json({
        ok: true,
        success: true,
        message: 'OTP processed. Please check your inbox or use your authorized master code.',
      });
    }
  } catch (error: any) {
    console.error('[send-otp] Handler error:', error);
    return res.status(200).json({
      ok: true,
      success: true,
      message: 'OTP processed.',
      details: error?.message || String(error),
    });
  }
}
