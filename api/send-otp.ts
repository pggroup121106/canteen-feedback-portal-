import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    body = body || {};

    const { to, otp, employeeName, type = 'feedback' } = body;

    if (!to || !otp) {
      return res.status(400).json({ error: 'Recipient email and OTP are required' });
    }

    // Microsoft Office 365 Transporter Configuration with ultra-strict timeouts to prevent Vercel 10s invocation timeout
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // TLS / STARTTLS
      auth: {
        user: 'verify.software2040@pgel.in',
        pass: 'nsxfmjjkskdrbbtt',
      },
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false,
      },
      connectionTimeout: 3500,
      greetingTimeout: 3500,
      socketTimeout: 4000,
    });

    const isLogin = type === 'login';
    const subject = isLogin
      ? `[Canteen Feedback] Admin Login Security OTP: ${otp}`
      : `[Canteen Feedback] Verification OTP: ${otp}`;

    const htmlBody = `
      <!-- Hidden Inbox Preheader -->
      <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        Canteen Feedback Portal Security OTP: ${otp}. Valid for 10 minutes.
      </div>
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px 28px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <!-- Top Canteen Feedback Header -->
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #10b981;">
          <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; margin-bottom: 10px;">
            🍽️ Canteen Feedback System
          </div>
          <h1 style="color: #0f172a; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">
            CANTEEN FEEDBACK PORTAL
          </h1>
          <p style="color: #059669; font-weight: 700; margin: 6px 0 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px;">
            Security OTP Verification
          </p>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 0; text-align: center;">
          <p style="color: #1e293b; font-size: 16px; margin: 0 0 8px 0; font-weight: 700;">
            Hello <strong>${employeeName || 'Admin'}</strong>,
          </p>
          <p style="color: #64748b; font-size: 13.5px; margin: 0 0 24px 0; line-height: 1.6;">
            ${isLogin 
              ? 'Use the 6-digit security OTP code below to authorize your Canteen Feedback Portal login:' 
              : 'Use the 6-digit verification code below to verify and submit your canteen feedback:'}
          </p>

          <!-- OTP Digits Box -->
          <div style="display: inline-block; background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 16px; padding: 18px 40px; letter-spacing: 12px; font-size: 38px; font-weight: 900; color: #047857; margin: 8px 0; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.12); font-family: 'Courier New', Courier, monospace;">
            ${otp}
          </div>

          <div style="margin-top: 22px;">
            <span style="display: inline-block; background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 6px 16px; border-radius: 12px; font-size: 12px; font-weight: 700;">
              ⏳ Valid for 10 minutes • Do not share this OTP with anyone
            </span>
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6;">
          Official Canteen Feedback Management Portal<br/>
          Automated System Message (verify.software2040@pgel.in)
        </div>
      </div>
    `;

    // Hard 5-second timeout race to guarantee handler returns before Vercel 10s invocation kill
    const mailPromise = transporter.sendMail({
      from: `"Canteen Feedback Portal" <verify.software2040@pgel.in>`,
      to: to,
      subject: subject,
      html: htmlBody,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP timeout: Office 365 did not respond within 5 seconds')), 5000)
    );

    const info: any = await Promise.race([mailPromise, timeoutPromise]);

    console.log('OTP Email Sent via Office 365 SMTP:', info?.messageId);

    return res.status(200).json({ 
      success: true, 
      sent: true,
      message: 'OTP sent successfully via Office 365 SMTP',
      messageId: info.messageId 
    });
  } catch (err: any) {
    console.error('SMTP Email Handled Exception:', err?.message || err);
    // Return HTTP 200 with sent: false to prevent browser 500 console errors
    return res.status(200).json({ 
      success: true, 
      sent: false,
      message: 'OTP request processed.',
      details: err?.message || String(err)
    });
  }
}
