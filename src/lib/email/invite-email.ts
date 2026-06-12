import { getResend } from "./client";
import { isValidEmail } from "@/lib/utils";

export type InviteScope = "organization" | "event" | "component";

const SCOPE_LABEL: Record<InviteScope, string> = {
  organization: "Organization",
  event: "Event",
  component: "Component",
};

const SCOPE_ACCENT: Record<InviteScope, string> = {
  organization: "#3b82f6",
  event: "#8b5cf6",
  component: "#14b8a6",
};

export interface InviteEmailArgs {
  inviterName: string;
  scope: InviteScope;
  scopeName: string; // org / event / component display name
  role: string;
  inviteUrl: string;
  expiresLabel: string; // e.g. "48 hours", "7 days"
}

/** Convert an expiry duration in hours into a friendly label. */
export function expiresLabel(hours: number): string {
  if (hours === 24) return "24 hours";
  if (hours === 48) return "48 hours";
  if (hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Escape user-supplied strings before interpolating into the HTML body. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// NOTE: This dark table-based shell is intentionally mirrored by the Supabase
// "Send Email" edge function (supabase/functions/send-email/index.ts), which
// renders auth emails in the Deno runtime and cannot import this module. Keep
// the two visually in sync — a palette/logo/footer change here should be applied
// there too.
export function renderInviteEmail(a: InviteEmailArgs): { subject: string; html: string } {
  const subject = `${a.inviterName} invited you to join ${a.scopeName} on Diony`;
  const accent = SCOPE_ACCENT[a.scope];
  const inviter = esc(a.inviterName);
  const scopeName = esc(a.scopeName);
  const role = esc(a.role).toUpperCase();
  const url = esc(a.inviteUrl);
  const expires = esc(a.expiresLabel);

  // Table-based layout with explicit bgcolor attributes so the dark theme renders
  // in clients that strip <body>/<html> CSS (Gmail, Outlook). Text colors are kept
  // light-on-dark but chosen for legibility even if a client forces a light surface.
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background-color:#05050F;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#05050F" style="background-color:#05050F;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;font-family:Arial,Helvetica,sans-serif;">
          <tr><td style="padding:0 8px 24px;font-size:13px;letter-spacing:.08em;color:#818CF8;text-transform:uppercase;">◆ Diony</td></tr>
          <tr><td bgcolor="#0D0D1C" style="background-color:#0D0D1C;border:1px solid #232336;border-radius:14px;padding:28px 24px;color:#E8EAF0;">
            <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;color:#FFFFFF;">You've been invited</h1>
            <p style="font-size:15px;color:#A0A8B8;margin:0 0 18px;">${inviter} invited you to join:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#15152A" style="background-color:#15152A;border-radius:10px;">
              <tr><td style="padding:14px 16px;">
                <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#FFFFFF;background-color:${accent};border-radius:6px;padding:3px 9px;">${SCOPE_LABEL[a.scope]}</span>
                <p style="font-size:16px;font-weight:600;margin:10px 0 4px;color:#FFFFFF;">${scopeName}</p>
                <p style="font-size:13px;color:#9AA1B2;margin:0;">Role: ${role}</p>
              </td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 18px;">
              <tr><td align="center" bgcolor="#6366F1" style="background-color:#6366F1;border-radius:10px;">
                <a href="${url}" style="display:block;padding:14px 20px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;">Accept invitation &rarr;</a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#9AA1B2;margin:0 0 16px;">This invite expires in ${expires} and can only be used once.</p>
            <p style="font-size:12px;color:#9AA1B2;margin:0 0 4px;">Or paste this link into your browser:</p>
            <p style="font-size:12px;color:#818CF8;word-break:break-all;margin:0;">${url}</p>
          </td></tr>
          <tr><td style="padding:18px 8px 0;font-size:12px;color:#6B7280;">You received this because ${inviter} invited you. If this was unexpected, you can safely ignore it.</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  return { subject, html };
}

/**
 * Send an invite email. Never throws — returns { sent: false } on any failure so
 * invite creation is never blocked by a mail problem.
 */
export async function sendInviteEmail(
  args: InviteEmailArgs & { to: string; replyTo?: string }
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  const from = process.env.EMAIL_FROM;
  if (!resend || !from) return { sent: false, error: "Email not configured" };
  if (!isValidEmail(args.to)) return { sent: false, error: "Invalid recipient address" };

  const { subject, html } = renderInviteEmail(args);
  try {
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject,
      html,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });
    if (error) {
      console.error("sendInviteEmail:", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (e) {
    console.error("sendInviteEmail threw:", e);
    return { sent: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
