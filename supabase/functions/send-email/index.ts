// Supabase Auth "Send Email" hook → renders branded HTML → sends via Resend.
//
// Enabling the Send Email Hook routes EVERY transactional auth email
// (recovery, signup confirmation, magic link, email change, invite,
// reauthentication) through this function — so it must handle all of them,
// not just password recovery.
//
// Auth: this endpoint is called by Supabase Auth with a Standard Webhooks
// signature, NOT a user JWT — deployed with verify_jwt = false and verified
// here via SEND_EMAIL_HOOK_SECRET.
//
// Required function secrets (set in Dashboard → Edge Functions → Secrets,
// or `supabase secrets set`):
//   RESEND_API_KEY          - Resend sending key (re_...)
//   SEND_EMAIL_HOOK_SECRET  - generated when you enable the hook (v1,whsec_...)
//   EMAIL_FROM              - optional; defaults to "Diony <hello.diony@diony.org>"
// SUPABASE_URL is injected automatically by the Edge runtime.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const FROM = Deno.env.get("EMAIL_FROM") ?? "Diony <hello.diony@diony.org>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;

interface EmailData {
  token: string;
  token_hash: string;
  token_hash_new?: string; // present for email-change ("new address" confirmation)
  redirect_to: string;
  email_action_type: string;
  site_url: string;
}

/** Escape user-supplied / URL strings before interpolating into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Copy {
  subject: string;
  heading: string;
  intro: string;
  cta: string;
  note: string;
}

/** Per-action subject + body copy. Falls back to a generic confirm. */
function copyFor(action: string): Copy {
  switch (action) {
    case "recovery":
      return {
        subject: "Reset your Diony password",
        heading: "Reset your password",
        intro:
          "We received a request to reset the password for your Diony account. Click the button below to choose a new one.",
        cta: "Reset password",
        note:
          "This link expires in 1 hour and can only be used once. If you didn't request a password reset, you can safely ignore this email — your password won't change.",
      };
    case "signup":
      return {
        subject: "Confirm your Diony email",
        heading: "Confirm your email",
        intro: "Confirm this email address to activate your Diony account.",
        cta: "Confirm email",
        note: "If you didn't create a Diony account, you can safely ignore this email.",
      };
    case "magiclink":
      return {
        subject: "Your Diony sign-in link",
        heading: "Sign in to Diony",
        intro: "Click the button below to sign in to your Diony account.",
        cta: "Sign in",
        note:
          "This link expires shortly and can only be used once. If you didn't request it, you can ignore this email.",
      };
    case "email_change":
    case "email_change_current":
    case "email_change_new":
      return {
        subject: "Confirm your new email",
        heading: "Confirm your new email",
        intro: "Confirm this address to finish changing the email on your Diony account.",
        cta: "Confirm email",
        note: "If you didn't request this change, you can safely ignore this email.",
      };
    case "invite":
      return {
        subject: "You've been invited to Diony",
        heading: "You've been invited",
        intro:
          "Click the button below to accept your invitation and set up your Diony account.",
        cta: "Accept invitation",
        note: "If this was unexpected, you can safely ignore this email.",
      };
    case "reauthentication":
      return {
        subject: "Confirm it's you · Diony",
        heading: "Confirm it's you",
        intro: "Use the button below to confirm this action on your Diony account.",
        cta: "Confirm",
        note: "If you didn't initiate this, you can safely ignore this email.",
      };
    default:
      return {
        subject: "Confirm your request on Diony",
        heading: "Confirm your request",
        intro: "Click the button below to continue.",
        cta: "Continue",
        note: "If you didn't request this, you can safely ignore this email.",
      };
  }
}

/**
 * Dark-themed, table-based HTML matching the invite email
 * (src/lib/email/invite-email.ts). Explicit bgcolor attributes so Gmail/Outlook
 * render the dark surface even when they strip <body>/<html> CSS.
 */
function renderEmail(action: string, confirmationUrl: string): { subject: string; html: string } {
  const c = copyFor(action);
  const url = esc(confirmationUrl);
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background-color:#05050F;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#05050F" style="background-color:#05050F;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;font-family:Arial,Helvetica,sans-serif;">
          <tr><td style="padding:0 8px 24px;font-size:13px;letter-spacing:.08em;color:#818CF8;text-transform:uppercase;">&#9670; Diony</td></tr>
          <tr><td bgcolor="#0D0D1C" style="background-color:#0D0D1C;border:1px solid #232336;border-radius:14px;padding:28px 24px;color:#E8EAF0;">
            <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;color:#FFFFFF;">${c.heading}</h1>
            <p style="font-size:15px;color:#A0A8B8;margin:0 0 22px;">${c.intro}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
              <tr><td align="center" bgcolor="#6366F1" style="background-color:#6366F1;border-radius:10px;">
                <a href="${url}" style="display:block;padding:14px 20px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;">${c.cta} &rarr;</a>
              </td></tr>
            </table>
            <p style="font-size:13px;color:#9AA1B2;margin:0 0 16px;">${c.note}</p>
            <p style="font-size:12px;color:#9AA1B2;margin:0 0 4px;">Or paste this link into your browser:</p>
            <p style="font-size:12px;color:#818CF8;word-break:break-all;margin:0;">${url}</p>
          </td></tr>
          <tr><td style="padding:18px 8px 0;font-size:12px;color:#6B7280;">Diony · Event management for teams</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
  return { subject: c.subject, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Fail loudly and clearly if the hook secret isn't configured. Without this,
  // `new Webhook("")` throws inside verify and every auth email returns a
  // confusing 401 "Invalid signature" — masking a config problem as a bad request.
  if (!hookSecret) {
    console.error("SEND_EMAIL_HOOK_SECRET is not set — auth emails cannot be verified or sent.");
    return new Response(
      JSON.stringify({ error: { message: "Email hook not configured (missing SEND_EMAIL_HOOK_SECRET)." } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let user: { email: string };
  let email_data: EmailData;
  try {
    const wh = new Webhook(hookSecret);
    const verified = wh.verify(payload, headers) as { user: { email: string }; email_data: EmailData };
    user = verified.user;
    email_data = verified.email_data;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(JSON.stringify({ error: { message: "Invalid signature" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { token_hash, token_hash_new, redirect_to, email_action_type } = email_data;

  // The "confirm new email" leg of an email change is verified with token_hash_new,
  // not token_hash — using the wrong one builds a verify link GoTrue will reject.
  const verifyTokenHash =
    email_action_type === "email_change_new" && token_hash_new ? token_hash_new : token_hash;

  // GoTrue verify endpoint consumes the token and 302-redirects to redirect_to
  // (appending the PKCE ?code= for the @supabase/ssr exchange in our callback).
  const confirmationUrl =
    `${SUPABASE_URL}/auth/v1/verify` +
    `?token=${encodeURIComponent(verifyTokenHash)}` +
    `&type=${encodeURIComponent(email_action_type)}` +
    `&redirect_to=${encodeURIComponent(redirect_to)}`;

  const { subject, html } = renderEmail(email_action_type, confirmationUrl);

  // Send via Resend with one retry on transient failure. Auth emails are
  // time-sensitive (password reset, signup) and a single blip shouldn't strand
  // the user — log every attempt so failures are observable in the function logs.
  let sendError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await resend.emails.send({ from: FROM, to: [user.email], subject, html });
    if (!error) { sendError = null; break; }
    sendError = error;
    console.error(`Resend send failed (attempt ${attempt}/2) for ${email_action_type}:`, error);
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
  }

  if (sendError) {
    // Non-200 tells GoTrue the email failed so it can surface an error.
    return new Response(JSON.stringify({ error: { message: sendError.message } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
