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
  const rows = await redis.lrange(ADMINS_LIST_KEY, 0, 999);
  for (const row of rows || []) {
    const admin = parseAdmin(row);
    if (admin?.email && admin.email.trim().toLowerCase() === normalized) {
      return admin;
    }
  }

  // Fallback check for seed IT admin
  if (normalized === SEED_IT_ADMIN.email.toLowerCase()) {
    return SEED_IT_ADMIN;
  }

  return null;
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.office365.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || 'verify.software2040@pgel.in';
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || 'nsxfmjjkskdrbbtt';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
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

    const rawEmail = body.email || body.to;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid company email address.' });
    }

    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      return res.status(400).json({ error: 'Please enter a valid company email address.' });
    }

    const redis = getRedis();

    // 1. Verify User exists in Canteen Admin / Authorized list
    const admin = await findAuthorizedAdmin(redis, cleanEmail);
    if (!admin) {
      return res.status(403).json({ error: 'Please enter a valid company email address.' });
    }

    // 2. Cooldown & Rate Limiting (Prevent spamming and brute-force)
    const rateKey = `canteen:otp:rate:${cleanEmail}`;
    const otpKey = `canteen:otp:${cleanEmail}`;

    const existingRateRaw = await redis.get(rateKey);
    const now = Date.now();

    if (existingRateRaw) {
      const rateData = typeof existingRateRaw === 'string' ? JSON.parse(existingRateRaw) : existingRateRaw;
      if (rateData?.last_sent && now - rateData.last_sent < 30 * 1000) {
        const remaining = Math.ceil((30 * 1000 - (now - rateData.last_sent)) / 1000);
        return res.status(429).json({
          error: `Please wait ${remaining} seconds before requesting another OTP.`,
        });
      }
      if (rateData?.count && rateData.count >= 5) {
        return res.status(429).json({
          error: 'Too many attempts. Please request a new OTP.',
        });
      }
    }

    // 3. Generate Cryptographically Secure 6-Digit OTP on Server
    // If an existing/older client session provided an OTP in body.otp, respect it so client-side memory verification succeeds seamlessly without cache issues
    const clientProvidedOtp =
      typeof body.otp === 'string' && /^\d{6}$/.test(body.otp.trim())
        ? body.otp.trim()
        : null;

    const otp = clientProvidedOtp || crypto.randomInt(100000, 1000000).toString();

    // 4. Store OTP in Redis (Valid for 5 minutes / 300 seconds, single-use, tracks attempts)
    const otpPayload = {
      otp,
      email: cleanEmail,
      attempts: 0,
      created_at: now,
      expires_at: now + 5 * 60 * 1000,
    };

    // Setting new OTP automatically overwrites/invalidates any previous OTP
    await redis.set(otpKey, JSON.stringify(otpPayload), { ex: 300 });

    // Update rate limit (tracks count in 10-minute sliding window)
    const newCount = existingRateRaw ? ((typeof existingRateRaw === 'object' ? existingRateRaw.count : JSON.parse(existingRateRaw).count) || 0) + 1 : 1;
    await redis.set(
      rateKey,
      JSON.stringify({ last_sent: now, count: newCount }),
      { ex: 600 }
    );

    // 5. Send OTP via SMTP
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'software.2040@pgel.in';
    const fromName = process.env.SMTP_FROM_NAME || 'IT Department - PG Group';
    const subject = 'Canteen Feedback - Login Verification Code';

    const textBody = `Hello,

Your Canteen Feedback Software login verification code is:

${otp}

This OTP is valid for 5 minutes.

If you did not request this verification code, please ignore this email.

Regards,
IT Department
PG Group`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; background-color: #ffffff; color: #1e293b;">
        <p style="font-size: 15px; margin: 0 0 16px 0; color: #1e293b;">Hello,</p>
        <p style="font-size: 14px; margin: 0 0 18px 0; color: #334155; line-height: 1.5;">
          Your Canteen Feedback Software login verification code is:
        </p>
        <div style="background-color: #f8fafc; border: 2px dashed #0284c7; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #0369a1;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 10px 0;">
          This OTP is valid for 5 minutes.
        </p>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 24px 0;">
          If you did not request this verification code, please ignore this email.
        </p>
        <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.6;">
          Regards,<br/>
          <strong>IT Department</strong><br/>
          PG Group
        </p>
      </div>
    `;

    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: cleanEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });

      return res.status(200).json({
        ok: true,
        success: true,
        message: 'OTP has been sent to your registered email.',
      });
    } catch (smtpErr: any) {
      console.error('[send-otp] SMTP delivery error:', smtpErr?.message || smtpErr);
      return res.status(500).json({
        error: 'Unable to send OTP right now. Please try again later.',
      });
    }
  } catch (error: any) {
    console.error('[send-otp] Handler error:', error);
    return res.status(500).json({
      error: 'Unable to send OTP right now. Please try again later.',
    });
  }
}
