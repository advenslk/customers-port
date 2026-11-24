import { Resend } from 'resend';
import { db } from '../db';

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || 'HelzerX Technologies <billing@helzerx.cyou>';

export function createInAppNotification(params: {
  userId: number;
  title: string;
  message: string;
  category?: string;
  linkTarget?: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, category, link_target)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      params.userId,
      params.title,
      params.message,
      params.category || 'system',
      params.linkTarget || 'overview'
    );
  } catch (err) {
    console.error('Notification insert failed:', err);
  }
}

export function notifyAllAdmins(params: {
  title: string;
  message: string;
  category?: string;
  linkTarget?: string;
}): void {
  try {
    const admins = db
      .prepare("SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND status = 'active'")
      .all() as Array<{ id: number }>;
    for (const admin of admins) {
      createInAppNotification({
        userId: admin.id,
        ...params,
      });
    }
  } catch (err) {
    console.error('Notify admins error:', err);
  }
}

function buildHelzerXEmailHtml(params: {
  heading: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const baseUrl = process.env.APP_URL || 'https://customers.helzerx.cyou';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#070709;color:#F5F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${params.preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#070709;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0D0D11;border:1px solid #22222A;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background:linear-gradient(135deg,#1C0B05 0%,#0D0D11 65%);border-bottom:1px solid #22222A;">
              <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#FFFFFF;">HELZERX <span style="color:#FF6B2C;">TECHNOLOGIES</span></div>
              <div style="font-size:12px;color:#A1A1AA;margin-top:4px;">customers.helzerx.cyou</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#FFFFFF;">${params.heading}</h1>
              <div style="font-size:14px;line-height:1.65;color:#D4D4D8;">
                ${params.bodyHtml}
              </div>
              ${
                params.ctaLabel
                  ? `<div style="margin-top:28px;">
                      <a href="${params.ctaUrl || baseUrl}" style="display:inline-block;padding:12px 24px;background-color:#EA580C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
                        ${params.ctaLabel}
                      </a>
                    </div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #22222A;font-size:12px;color:#71717A;">
              HelzerX Technologies Inc. &middot; 548 Market St, San Francisco, CA &middot; Automated Portal Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  templateName: string;
  heading: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<void> {
  const html = buildHelzerXEmailHtml(params);

  if (!resendClient) {
    db.prepare(`
      INSERT INTO email_logs (recipient_email, subject, template_name, status, provider_id, error_message)
      VALUES (?, ?, ?, 'logged_dev', '', 'RESEND_API_KEY not configured; email recorded in portal outbox')
    `).run(params.to, params.subject, params.templateName);
    return;
  }

  try {
    const result = await resendClient.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html,
    });
    const providerId = (result as any)?.data?.id || '';
    const errMsg = (result as any)?.error?.message || '';
    db.prepare(`
      INSERT INTO email_logs (recipient_email, subject, template_name, status, provider_id, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(params.to, params.subject, params.templateName, errMsg ? 'failed' : 'sent', providerId, errMsg);
  } catch (err: any) {
    db.prepare(`
      INSERT INTO email_logs (recipient_email, subject, template_name, status, provider_id, error_message)
      VALUES (?, ?, ?, 'failed', '', ?)
    `).run(params.to, params.subject, params.templateName, err?.message || 'Unknown error');
  }
}

export async function sendDiscordWebhook(params: {
  event: string;
  title: string;
  description: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'HelzerX Portal Telemetry',
        embeds: [
          {
            title: params.title,
            description: params.description,
            color: params.color ?? 0xea580c,
            fields: params.fields ?? [],
            footer: { text: `HelzerX Customer Portal · ${params.event}` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Discord webhook dispatch error:', err);
  }
}
