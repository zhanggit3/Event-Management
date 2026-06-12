import { Resend } from "resend";

let _resend: Resend | null = null;

/**
 * Lazily construct a Resend client from RESEND_API_KEY.
 * Returns null when the key is not configured so callers can degrade gracefully
 * (invite creation must still succeed even when email isn't set up).
 */
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/**
 * True when both the API key and a From address are configured.
 *
 * NOTE: app-side invite email requires BOTH `RESEND_API_KEY` and `EMAIL_FROM`
 * in the Next.js environment. This is a SEPARATE config store from the Supabase
 * edge function's secrets (which delivers auth emails and defaults `EMAIL_FROM`).
 * If `EMAIL_FROM` is set only as an edge-function secret, invite emails silently
 * no-op here — we warn so that footgun is observable instead of invisible.
 */
export function isEmailConfigured(): boolean {
  const hasKey = !!process.env.RESEND_API_KEY;
  const hasFrom = !!process.env.EMAIL_FROM;
  if (hasKey && !hasFrom) {
    console.warn(
      "[email] RESEND_API_KEY is set but EMAIL_FROM is not — invite emails will not be sent. Set EMAIL_FROM in the Next.js environment."
    );
  }
  return hasKey && hasFrom;
}
