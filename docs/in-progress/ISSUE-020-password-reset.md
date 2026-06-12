# ISSUE-020: Forgot / reset password flow

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #020

## Problem

A user who forgets their password has no way to regain access — the login page only supports email + password sign-in, with no "Forgot password?" path. We need a self-service flow where the user enters their email, receives a recovery link, and sets a new password. Email delivery infrastructure (a branded `send-email` edge function → Resend) is **already built and deployed** — this issue is the in-app UI + routing only.

## Acceptance Criteria

- [ ] The login page shows a "Forgot password?" link that navigates to `/forgot-password`.
- [ ] On `/forgot-password`, submitting a valid email triggers a Supabase recovery email and shows a "Check your email" confirmation.
- [ ] For security, the confirmation message is identical whether or not the email belongs to a real account (no account enumeration).
- [ ] The recovery email link lands the user on `/reset-password` with an active recovery session.
- [ ] On `/reset-password`, the user enters a new password (min 8 chars) + confirmation; on submit the password is updated, the session is signed out, and the user is redirected to `/login` (where they sign in with the new password).
- [ ] If the two password fields don't match, an inline error is shown and no update is attempted.
- [ ] If the user opens `/reset-password` without a valid recovery session, they see a "link expired / invalid" message with a link back to `/forgot-password`.
- [ ] `/forgot-password` and `/reset-password` are reachable without being logged in (not redirected to `/login` by the proxy).
- [ ] `npx tsc --noEmit` is clean and `npm run build` succeeds with the two new routes present.

## Affected Files

**Modify:**
- `src/app/(auth)/login/page.tsx` — add a "Forgot password?" link (to `/forgot-password`) under the password field.
- `src/proxy.ts` — add `/forgot-password` and `/reset-password` to `PUBLIC_PREFIXES` so unauthenticated users can reach them.

**Create:**
- `src/app/(auth)/forgot-password/page.tsx` — `"use client"` page: email input → `supabase.auth.resetPasswordForEmail(...)` → success state.
- `src/app/(auth)/reset-password/page.tsx` — `"use client"` page: new-password + confirm inputs → `supabase.auth.updateUser({ password })` → redirect.

**Read-only context (do not modify):**
- `src/app/api/auth/callback/route.ts` — the recovery email redirects here; it exchanges the code for a session and forwards to `next`. Already handles the recovery code — **do not change it**.
- `src/lib/supabase/client.ts` — the browser Supabase client factory used by all `(auth)` pages.

## Relevant Code Context

### How auth pages talk to Supabase (browser client, NOT a server action)

`(auth)` pages use the browser client directly. From `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

The login page's submit handler (the pattern to mirror — browser client, `useState` error/loading, hard `window.location.href` redirect after success):

```tsx
async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setLoading(true);
  setError(null);

  const formData = new FormData(e.currentTarget);
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      formRef.current?.reset();
      setError("The email or password is incorrect, please try again.");
      setLoading(false);
      return;
    }
    window.location.href = redirectPath; // hard navigation — required (see callback note)
  } catch (e) {
    setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    setLoading(false);
  }
}
```

### The auth callback (already built — recovery links route through this)

`src/app/api/auth/callback/route.ts`:

```ts
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

This means the recovery email's redirect target must be `/api/auth/callback?next=/reset-password`. Supabase appends the `?code=...` for the PKCE exchange; the callback sets the session cookie and forwards the now-authenticated user to `/reset-password`.

### Site URL env var (pattern from `invites.ts` / `organizations.ts`)

```ts
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
```

### Login/signup card markup (copy this shell for visual consistency)

The two new pages must match this dark/glass card. Structure from `login/page.tsx`:

```tsx
<div className="w-full max-w-sm mx-auto">
  <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
    <div className="flex justify-center mb-6">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
        <DionyLogo className="w-5 h-5 text-white" />
      </div>
    </div>
    <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">{/* title */}</h1>
    <p className="text-sm text-white/40 text-center mb-7">{/* subtitle */}</p>

    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
          Email
        </label>
        <input
          id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email"
          className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
        />
      </div>
      <button
        type="submit" disabled={loading}
        className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        {loading ? "..." : "..."}
      </button>
    </form>
  </div>
</div>
```

Import the logo with: `import { DionyLogo } from "@/components/diony-logo";`

### Proxy public-path list (where to add the two routes)

From `src/proxy.ts`:

```ts
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/invite",
  "/join",
  "/auth/callback",
  "/_next",
  "/favicon.ico",
  "/api/",
];
```

`isPublicPath` uses `pathname.startsWith(prefix)`. The new pages are not in `PROTECTED_PREFIXES`, so the proxy won't force-redirect them, but add them to `PUBLIC_PREFIXES` to be explicit and future-proof. `isAuthPage` only matches `/login` and `/signup`, so an authenticated recovery user is **not** bounced off `/reset-password` — no change needed there.

## Implementation Steps

### 1. `src/app/(auth)/forgot-password/page.tsx`

`"use client"`. Single email field. On submit:

```tsx
const supabase = createClient();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
});
```

- Regardless of whether `error` is set, render the **same** success state ("If an account exists for that email, we've sent a reset link. Check your inbox.") — do not reveal whether the email exists. (Only surface a generic failure if the call throws.)
- Success state replaces the form with the confirmation message + a "Back to sign in" `Link` to `/login`.
- Title: "Reset your password". Subtitle: "Enter your email and we'll send you a reset link."
- Add a "Remember your password? Sign in" `Link` to `/login` at the bottom (mirror login's footer link styling).
- Wrap the page body in `<Suspense>` only if you use `useSearchParams`; this page does not need it, so a plain default export is fine.

### 2. `src/app/(auth)/reset-password/page.tsx`

`"use client"`. Two fields: "New password" (`minLength={8}`, `autoComplete="new-password"`) and "Confirm new password".

On mount, verify a recovery session exists:

```tsx
const [ready, setReady] = useState(false);
const [invalid, setInvalid] = useState(false);

useEffect(() => {
  const supabase = createClient();
  supabase.auth.getUser().then(({ data }) => {
    if (data.user) setReady(true);
    else setInvalid(true);
  });
}, []);
```

On submit:

```tsx
if (password !== confirm) { setError("Passwords don't match."); return; }
const supabase = createClient();
const { error } = await supabase.auth.updateUser({ password });
if (error) { setError(error.message); setLoading(false); return; }
// Force a fresh login with the new password — kills the recovery session.
await supabase.auth.signOut();
window.location.href = "/login?reset=success"; // hard navigation, consistent with login
```

- While `getUser()` is resolving, show a small "Loading..." state.
- If `invalid` is true, show: "This reset link is invalid or has expired." + a `Link` to `/forgot-password` ("Request a new link").
- Title: "Set a new password". Subtitle: "Choose a new password for your account."
- On `/login`, optionally read `?reset=success` (via `useSearchParams`, already used there) to show a one-line success banner: "Password updated — sign in with your new password." Keep it minimal; the redirect itself is the required behavior.

### 3. `src/app/(auth)/login/page.tsx`

Add a right-aligned "Forgot password?" link. Place it just above or beside the password label. Example, inside the password field's `space-y-1.5` block, replace the lone `<label>` with a label row:

```tsx
<div className="flex items-center justify-between">
  <label htmlFor="password" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
    Password
  </label>
  <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
    Forgot password?
  </Link>
</div>
```

(`Link` is already imported in this file.)

### 4. `src/proxy.ts`

Add `"/forgot-password"` and `"/reset-password"` to `PUBLIC_PREFIXES`.

### 5. Email delivery & dashboard config

**Email delivery is already built — the coder does NOT touch it.** Recovery emails are sent by the `send-email` Supabase Edge Function (`supabase/functions/send-email/index.ts`), which renders branded HTML and sends via Resend from `Diony <hello.diony@diony.org>`. It builds the link as `${SUPABASE_URL}/auth/v1/verify?token=…&type=recovery&redirect_to=<the redirectTo from step 1>`, so the app-side `redirectTo` of `/api/auth/callback?next=/reset-password` flows through unchanged. The function is deployed (`verify_jwt = false`) and handles all auth email types.

One-time project config (for whoever deploys — **not** code):

- **Authentication → URL Configuration:**
  - Site URL: `https://app.diony.org`
  - Redirect URLs: `https://app.diony.org/**` (prod) and `http://localhost:3000/**` (local dev)
- **Authentication → Hooks → Send Email Hook:** enabled, HTTPS, pointing at `https://sljvlxipnlkqruxlqdsf.supabase.co/functions/v1/send-email`. Copy the generated `v1,whsec_…` signing secret.
- **Edge Functions → Secrets** (the function's own store, separate from the Next app's env): `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET` (from the hook above), and optional `EMAIL_FROM`.
- **Vercel env (production):** `NEXT_PUBLIC_SITE_URL = https://app.diony.org` — must NOT remain `http://localhost:3000`, or every reset link points at localhost.

### 6. Verify

Run `npx tsc --noEmit` and `npm run build`. Confirm `/forgot-password` and `/reset-password` appear in the printed route table.

## Test Scenarios

**Happy path:**
- User on `/login` clicks "Forgot password?" → `/forgot-password` → enters their real email → sees "check your email" → opens email link → lands authenticated on `/reset-password` → enters matching new password → signed out and redirected to `/login` → signs in successfully with the new password (and the old password no longer works).

**Edge cases:**
- Email that has no account: `/forgot-password` shows the **same** confirmation message (no enumeration), no error revealing non-existence.
- Mismatched password fields on `/reset-password`: inline "Passwords don't match" error, no Supabase call made.
- Password shorter than 8 chars: blocked by `minLength` (and Supabase's own min-length error surfaced if it slips through).
- Opening `/reset-password` directly with no recovery session: "invalid or expired" message + link to `/forgot-password`.

**Error cases:**
- `resetPasswordForEmail` throws (network down): show a generic "Something went wrong, please try again." and let the user retry.
- Expired/used recovery code: the callback redirects to `/login?error=auth_callback_failed`; user can restart from `/forgot-password`.

**RLS (if applicable):**
- N/A — password reset is handled entirely by Supabase Auth (`auth` schema), not `public` tables.

## Constraints

- Do **not** modify `src/app/api/auth/callback/route.ts` — it already handles the recovery code exchange via the `next` param.
- Do **not** create a server action for this; mirror login/signup, which call the **browser** Supabase client (`@/lib/supabase/client`) directly from the client component.
- Do **not** use `router.push` / `router.refresh` after a successful password update — use a hard `window.location.href = "/"` (the session cookie isn't reliably read server-side without a full reload).
- Do **not** create `src/middleware.ts` — `src/proxy.ts` is the Next.js 16 middleware; a sibling `middleware.ts` is a fatal conflict.
- Match the dark/glass card design from `login/page.tsx` exactly (indigo→violet gradient button, `bg-white/[0.04]` card, `DionyLogo`). No new color scheme.
- Keep the no-enumeration behavior on `/forgot-password`: never branch the UI on whether the email exists.
- Do **not** touch `supabase/functions/send-email/` or the email infrastructure — it's already deployed. This issue is app pages + proxy only.

## Technical Notes

- The recovery flow is **PKCE-based** (`@supabase/ssr`). `resetPasswordForEmail` stores the code verifier in the browser's Supabase cookie; the email link returns to `/api/auth/callback?code=...`, where `exchangeCodeForSession` (server-side) reads that cookie and mints the session. This is why `redirectTo` must point at the callback route, not directly at `/reset-password`.
- After `exchangeCodeForSession`, the user holds a normal authenticated session — `/reset-password` can simply call `getUser()` to confirm validity and `updateUser({ password })` to set the password. There is no separate "recovery token" to manage in app code.
- `NEXT_PUBLIC_SITE_URL` must be set in the deployed environment for the email link to point at the right origin; locally it falls back to `window.location.origin` (or `http://localhost:3000`). Production value: `https://app.diony.org`.
- **Email rendering/branding is out of scope for this issue.** The recovery email's look and copy live in the `send-email` edge function, not in app code. The coder builds only the two pages + the link + the proxy change. If a reset email isn't received in testing, it's an infra/config issue (hook enabled? secrets set? domain verified?), not an app-code bug.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Files created:**
- `src/app/(auth)/forgot-password/page.tsx` — `"use client"` page. Single email field. On submit calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${siteUrl}/api/auth/callback?next=/reset-password\` })` where `siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin`. The `resetPasswordForEmail` error is intentionally ignored (never branched on) to prevent account enumeration — on a resolved call it always renders the same success state: "If an account exists for that email, we've sent a reset link. Check your inbox." with a "Back to sign in" link. A thrown error (e.g. network failure) surfaces a generic "Something went wrong, please try again." Footer has "Remember your password? Sign in" → `/login`. No `useSearchParams`, so a plain default export (no `Suspense`).
- `src/app/(auth)/reset-password/page.tsx` — `"use client"` page. On mount, `getUser()` verifies a recovery session: `ready` gates the form, `invalid` shows "This reset link is invalid or has expired." + "Request a new link" → `/forgot-password`. While `getUser()` resolves it shows "Loading...". Two fields: "New password" and "Confirm new password", both `minLength={8}` / `autoComplete="new-password"`. On submit: if `password !== confirm`, sets inline "Passwords don't match." and returns before any Supabase call; otherwise `updateUser({ password })`, then on success `signOut()` and hard `window.location.href = "/login?reset=success"`. Supabase update errors are surfaced inline (covers the slipped-through short-password case).

**Files modified:**
- `src/app/(auth)/login/page.tsx` — added a right-aligned "Forgot password?" `Link` → `/forgot-password` in a `flex justify-between` row beside the Password label. Also added an optional success banner (read via existing `useSearchParams`: `reset === "success"`) above the form: "Password updated — sign in with your new password."
- `src/proxy.ts` — added `"/forgot-password"` and `"/reset-password"` to `PUBLIC_PREFIXES`.
- `tsconfig.json` — added `"supabase/functions"` to `exclude`. See "Decisions" below.

**What was implemented:** The full in-app forgot/reset UI + routing per the PRD. Email infrastructure (`send-email` edge function, Resend) and `src/app/api/auth/callback/route.ts` were left untouched, as required.

**Verification results:**
- `npx tsc --noEmit` → clean, exit 0, no output.
- `npm run build` → succeeds. Route table includes both new routes:
  ```
  ├ ○ /forgot-password
  ...
  ├ ○ /reset-password
  ```
  (Both prerendered as static `○`, alongside `○ /login` and `○ /signup`.)

**No automated test runner exists** in this project (no jest/vitest, no test scripts), so the PRD "Test Scenarios" were verified by code inspection:
- *Happy path* — login "Forgot password?" link → `/forgot-password` form → `resetPasswordForEmail` with `redirectTo` pointing at the callback (`?next=/reset-password`) → `/reset-password` gated on `getUser()` → matching passwords → `updateUser` → `signOut` → hard redirect to `/login?reset=success` with banner.
- *No-account email* — same success state rendered unconditionally; the `resetPasswordForEmail` result is never inspected (no enumeration branch).
- *Mismatched passwords* — early `if (password !== confirm)` sets the inline error and `return`s before `createClient()`/`updateUser`, so no Supabase call is made.
- *Password < 8 chars* — blocked by `minLength={8}` on both inputs; a slipped-through case surfaces Supabase's `error.message` inline.
- *No recovery session* — `getUser()` returns no user → `invalid` → "invalid or has expired" + "Request a new link" → `/forgot-password`.
- *Network throw on `resetPasswordForEmail`* — caught, renders generic "Something went wrong, please try again." and stays on the form for retry.
- *Expired/used recovery code* — handled upstream by the untouched callback route (`/login?error=auth_callback_failed`); user restarts from `/forgot-password`.

**Decisions made (not specified in the PRD):**
- **`tsconfig.json` exclude of `supabase/functions`.** The repo's `tsconfig.json` `include` is `["**/*.ts", ...]`, which pulled the pre-existing Deno edge function `supabase/functions/send-email/index.ts` (created during this issue's infra setup) into the Next.js TypeScript pass. That file uses Deno-only globals and `https://`/`jsr:`/`npm:` import specifiers that cannot resolve under the Next/bundler tsconfig, so both `tsc --noEmit` and `next build`'s type step failed on it — independent of any app code. This blocked the PRD's required acceptance gate. The minimal, infra-respecting fix was to exclude `supabase/functions` from the app tsconfig (Deno functions are not meant to be type-checked by the Next compiler; they have their own Deno runtime). I did **not** touch the edge function file or the email infra, per the constraints.
- Button labels ("Send reset link →", "Update password →") and loading labels ("Sending...", "Updating...") were chosen to mirror login's arrow/active-verb style; not dictated by the PRD.
- Reset-success banner uses an emerald accent to distinguish it from the red error styling.

**Assumptions / concerns:**
- The `tsconfig` exclude assumes the project never relied on the Next build to type-check Deno edge functions (it can't, given the import specifiers). If a separate Deno/`deno check` workflow is desired for those functions, that is out of scope here.
- The recovery flow's end-to-end behavior depends on the one-time Supabase/Vercel config in PRD step 5 (Site URL, redirect URLs, hook + secrets, prod `NEXT_PUBLIC_SITE_URL`). That config is infra, not code, and was not part of this implementation.

### Evaluator Report

**Reviewer:** Code Evaluator & Mentor (senior review pass)
**Verdict:** Shippable. All 9 acceptance criteria met; gates pass (`npx tsc --noEmit` → exit 0; `npm run build` → success with both `○ /forgot-password` and `○ /reset-password` in the route table). No critical issues.

**Findings by severity:** 🔴 Critical: 0 — 🟡 Medium: 2 — 🔵 Low: 3

---

#### Acceptance Criteria — all met

1. ✅ Login shows "Forgot password?" → `/forgot-password` — `login/page.tsx:127-129`.
2. ✅ `/forgot-password` submit triggers `resetPasswordForEmail` and shows confirmation — `forgot-password/page.tsx:26-29`, `55-69`.
3. ✅ No enumeration — the `resetPasswordForEmail` result is never inspected; `setSent(true)` runs unconditionally on a resolved call — `forgot-password/page.tsx:26-30`. Same message in all cases.
4. ✅ Recovery link → `/reset-password` via `redirectTo: ${siteUrl}/api/auth/callback?next=/reset-password` — `forgot-password/page.tsx:27`. Matches the untouched callback route.
5. ✅ New password (min 8) + confirm → `updateUser` → `signOut` → hard redirect to `/login?reset=success` — `reset-password/page.tsx:39-47`.
6. ✅ Mismatch → inline error, no Supabase call (early `return` before `createClient()`) — `reset-password/page.tsx:30-33`.
7. ✅ No recovery session → "invalid or has expired" + "Request a new link" → `/forgot-password` — `reset-password/page.tsx:16-19`, `74-87`.
8. ✅ Both routes added to `PUBLIC_PREFIXES` — `proxy.ts:8-9`. Also confirmed not in `PROTECTED_PREFIXES`, and `isAuthPage` (still `/login`+`/signup` only) does not bounce an authenticated recovery user off `/reset-password`.
9. ✅ tsc clean + build succeeds with both routes (verified locally by reviewer, not just reported).

---

#### 🟡 Medium

- **🟡 `reset-password/page.tsx:14-20` — recovery-session guard accepts ANY authenticated user, not just a recovery session.** `getUser()` returns a user for any valid session, so an already-logged-in user who navigates to `/reset-password` directly will see the form (not the "invalid link" state) and can change their password without re-auth. This is a known limitation of the PRD's prescribed approach (the PRD itself says "call `getUser()` to confirm validity"), and Supabase recovery sessions are not distinguishable from normal sessions via the browser client without listening for the `PASSWORD_RECOVERY` event. **Not a regression and within spec**, but worth flagging: it means `/reset-password` doubles as an unguarded "change password" page for any logged-in user. Recommended (follow-up, optional): gate on `supabase.auth.onAuthStateChange` for the `PASSWORD_RECOVERY` event instead of a bare `getUser()`, or require the user to enter their current password when an existing (non-recovery) session is present. Acceptable to ship as-is given the PRD explicitly prescribed `getUser()`.

- **🟡 `forgot-password/page.tsx:21-31` — `email` is sent to Supabase without a present/non-empty guard, and a malformed (but non-throwing) call could differ in timing.** The `required` + `type="email"` input attributes cover the normal browser path, but the no-enumeration guarantee can still leak via *response timing* (a real account triggers an email send + hook round-trip; a non-existent one returns faster). This is a Supabase-side characteristic, not an app bug, and the visual no-enumeration requirement is fully satisfied. Flagging only so it's a conscious acceptance. No code change required.

---

#### 🔵 Low

- **🔵 `reset-password/page.tsx:88-91` — `!ready` loading state also renders briefly before `invalid` resolves, but the ordering is correct.** The ternary checks `invalid` first, then `!ready`, then the form. Because both `setReady`/`setInvalid` fire from the same `getUser()` resolution, there is no flash of the form before the guard resolves. Minor: the initial paint shows "Loading..." which is correct. No change needed; noted for completeness.

- **🔵 `tsconfig.json:33` — excluding `supabase/functions` is appropriate and minimal.** Verified: that directory contains only the Deno edge function `send-email/index.ts`, which imports via `jsr:`/`https://esm.sh` specifiers that cannot resolve under the Next bundler tsconfig — confirmed it genuinely breaks the type pass and is not meant to be checked by the Next compiler. The exclude adds exactly one path and pulls in **no** app code (`src/**` is untouched; `**/*.ts(x)` still covers the whole app). This is the correct, infra-respecting fix and does not weaken app type coverage. Low only as a note: if a separate `deno check` workflow is ever wanted for that function, that's out of scope here.

- **🔵 `reset-password/page.tsx:46` — `signOut()` result is not checked.** If `signOut()` fails (network), the hard redirect to `/login?reset=success` still fires and the (now stale) recovery session cookie may linger client-side until expiry. Low risk: the password was already updated server-side and the recovery session is single-use/short-lived. Optional: `await supabase.auth.signOut({ scope: 'local' })` or ignore — current behavior is acceptable.

---

#### Code quality / security / consistency — good

- Mirrors the login/signup pattern exactly: browser client via `@/lib/supabase/client`, `useState` for error/loading, hard `window.location.href` redirect (no `router.push`/`refresh`), dark/glass card + `DionyLogo`. ✅
- Password-match check happens **before** any `createClient()`/Supabase call (`reset-password/page.tsx:30-33` precedes line 38). ✅
- No server action introduced; callback route untouched; `send-email` infra untouched. ✅
- No `useSearchParams` on the two new pages, so no `Suspense` boundary needed — correct. Login already wraps its `useSearchParams` consumer (`LoginForm`) in `<Suspense>` (`login/page.tsx:169-181`), and the new `reset=success` read at line 13 lives inside that existing boundary — no new Suspense requirement introduced, build confirms no CSR-bailout warning. ✅
- No secrets leaked; types are correct (`error: string | null`, form values cast as `string`); error handling present on both throw paths. ✅

**Overall:** This is close to shippable as-is. Zero critical findings; the two Medium items are within-spec acceptances (the recovery-guard breadth is dictated by the PRD's `getUser()` approach, and the timing-channel is Supabase-side), not blocking defects. Recommend merging; consider the `PASSWORD_RECOVERY`-event guard as a future hardening follow-up.

### Coder Revision Report

**Reviewer findings addressed (0 Critical, 2 Medium, 3 Low).**

#### 🟡 Medium 1 — recovery-session guard accepts any authenticated user (`reset-password/page.tsx`)
**Action: hardened additively, working `getUser()` gate retained.** I added an `onAuthStateChange` listener that sets `ready=true` *only* on the `PASSWORD_RECOVERY` event, layered **on top of** (not replacing) the existing `getUser()` gate. Reasoning per the architecture constraint: this app uses the SSR/PKCE recovery flow — the session is minted server-side by `/api/auth/callback` (`exchangeCodeForSession`) and the user arrives at `/reset-password` via a hard redirect with the session already in cookies. There is no client-visible URL hash, so the client-side `PASSWORD_RECOVERY` event generally does **not** fire in this flow. Swapping the guard to *require* that event would break the page (the form would never become ready). 

The implementation is therefore strictly additive and cannot regress the working flow:
- The listener clears `invalid` and sets `ready` if `PASSWORD_RECOVERY` ever fires (belt-and-suspenders for environments/flows where it does).
- A `recovered` flag guards the `getUser()` resolution so it never flips a recovery-confirmed page back to `invalid`.
- The `getUser()` check remains the **primary** gate and is what actually drives the page in the SSR/PKCE flow.
- The subscription is cleaned up on unmount.

The underlying breadth (an already-logged-in user visiting `/reset-password` directly can change their password without re-auth) remains, because Supabase's browser client cannot distinguish a recovery session from a normal one in the SSR/PKCE flow without the event that doesn't fire here. This is **within spec** (the PRD explicitly prescribed `getUser()` for exactly this reason). The additive event listener is the maximum safe hardening that does not risk breaking the prescribed flow. Verified: `getUser()` path still gates the form (build + tsc clean), so the live SSR/PKCE flow is unaffected.

#### 🟡 Medium 2 — no-enumeration timing channel (`forgot-password/page.tsx`)
**Action: accepted, no code change (justified).** This is a Supabase-side characteristic (a real account triggers an email-send + hook round-trip, a non-existent one may return faster), not an app bug. The *visual* no-enumeration requirement (AC #3) is fully met — the result of `resetPasswordForEmail` is never inspected and the same success state renders unconditionally. Mitigating the response-timing channel would require artificial server-side delay/queueing in Supabase Auth, which is outside this app's code and outside the issue scope. Consciously accepted.

#### 🔵 Low items
- **Low — `signOut()` result not checked (`reset-password/page.tsx`): APPLIED.** Changed to `supabase.auth.signOut({ scope: "local" })`, which clears the session cookie client-side without depending on a server round-trip (more robust for killing the recovery session). The result is now captured and a failure is logged via `console.warn`, but the hard redirect always proceeds since the password was already updated server-side. Safe, trivial.
- **Low — `tsconfig.json` exclude of `supabase/functions`: NO CHANGE NEEDED.** The evaluator confirmed this is the correct, minimal, infra-respecting fix that pulls in no app code. Left as-is.
- **Low — `!ready` loading flash ordering: NO CHANGE NEEDED.** The evaluator confirmed the ternary order (`invalid` → `!ready` → form) is correct with no flash. Left as-is.

#### Verification after revisions
- `npx tsc --noEmit` → **clean** (exit 0, no output).
- `npm run build` → **success**. Both routes present in the route table: `○ /forgot-password` and `○ /reset-password` (still statically prerendered, alongside `○ /login` and `○ /signup`). No new CSR-bailout/Suspense warnings.

### Documentation Report

**No doc changes needed.** This feature introduces no new setup steps, commands, or env vars, and adds no developer-workflow surface that the README covers.

**README:** Not modified. `README.md` is the unmodified `create-next-app` boilerplate — it documents only `npm run dev` and generic Next.js links, with no Supabase/auth setup, no environment-variable table, and no feature documentation. The password-reset flow:
- Adds no new commands (still `npm run dev` / `npm run build` / `npx tsc --noEmit`).
- Adds no new environment variables — it reuses the already-existing `NEXT_PUBLIC_SITE_URL` (documented in `CLAUDE.md` §11), and the Send Email hook / Resend secrets are pre-existing, already-deployed infra outside this issue's scope.
- Adds two user-facing routes (`/forgot-password`, `/reset-password`) reachable from the login page's "Forgot password?" link, but these are self-evident in the app and have no developer setup implication.

Since the README has no auth/env/feature sections for a reset-flow note to attach to, adding one would require introducing new sections (restructuring), which is out of scope for this conservative doc pass. The relevant developer-facing context (auth pattern, `NEXT_PUBLIC_SITE_URL`, proxy public paths, recovery flow) already lives in `CLAUDE.md`, which the task forbids touching.

### Coordinator Summary

**Reviewer:** Coordinator (final verdict pass) — verified against the actual code and an independent gate run.

#### Acceptance Criteria

- ✅ **"The login page shows a 'Forgot password?' link that navigates to `/forgot-password`."** — `login/page.tsx:123-130`: a right-aligned `<Link href="/forgot-password">` in a `flex justify-between` row beside the Password label.
- ✅ **"On `/forgot-password`, submitting a valid email triggers a Supabase recovery email and shows a 'Check your email' confirmation."** — `forgot-password/page.tsx:26-29` calls `resetPasswordForEmail`; on resolution `setSent(true)` (line 29) swaps the form for the confirmation block (lines 55-69).
- ✅ **"For security, the confirmation message is identical whether or not the email belongs to a real account (no account enumeration)."** — The `resetPasswordForEmail` result is never inspected (the await on line 26 discards it); `setSent(true)` runs unconditionally on any resolved call, rendering one fixed message. No branch on email existence.
- ✅ **"The recovery email link lands the user on `/reset-password` with an active recovery session."** — `redirectTo: ${siteUrl}/api/auth/callback?next=/reset-password` (`forgot-password/page.tsx:27`); the untouched callback route does `exchangeCodeForSession` and forwards to `next`, so the user arrives at `/reset-password` authenticated.
- ✅ **"On `/reset-password`, the user enters a new password (min 8 chars) + confirmation; on submit the password is updated, the session is signed out, and the user is redirected to `/login`."** — `reset-password/page.tsx`: both inputs `minLength={8}` (lines 139, 158); `updateUser({ password })` (line 59) → `signOut({ scope: "local" })` (line 69) → hard `window.location.href = "/login?reset=success"` (line 73).
- ✅ **"If the two password fields don't match, an inline error is shown and no update is attempted."** — `reset-password/page.tsx:50-53`: `if (password !== confirm)` sets the inline error and `return`s before `createClient()`/`updateUser` (which start at line 58). No Supabase call is made.
- ✅ **"If the user opens `/reset-password` without a valid recovery session, they see a 'link expired / invalid' message with a link back to `/forgot-password`."** — `getUser()` with no user sets `invalid` (`reset-password/page.tsx:36`); the `invalid` branch (lines 100-113) renders "This reset link is invalid or has expired." + a `Link` to `/forgot-password`.
- ✅ **"`/forgot-password` and `/reset-password` are reachable without being logged in (not redirected to `/login` by the proxy)."** — Both added to `PUBLIC_PREFIXES` (`proxy.ts:7-8`); neither is in `PROTECTED_PREFIXES`, and `isAuthPage` (line 38-40) still matches only `/login`/`/signup`, so an authenticated recovery user is not bounced off `/reset-password`.
- ✅ **"`npx tsc --noEmit` is clean and `npm run build` succeeds with the two new routes present."** — Independently re-run by the coordinator: `tsc --noEmit` → exit 0, no output; `npm run build` → "Compiled successfully", route table prints `○ /forgot-password` and `○ /reset-password` (both static, alongside `○ /login` and `○ /signup`).

#### Evaluator findings — resolution confirmed

- 🔴 Critical: 0.
- 🟡 Medium 1 (recovery guard accepts any authenticated session): **hardened additively** — an `onAuthStateChange` `PASSWORD_RECOVERY` listener was layered on top of the primary `getUser()` gate (`reset-password/page.tsx:23-37`), with a `recovered` flag so the event can never be overridden back to `invalid`, plus subscription cleanup. The residual breadth is intrinsic to the PRD-prescribed SSR/PKCE `getUser()` approach (the event does not fire in this flow); consciously accepted with valid justification.
- 🟡 Medium 2 (no-enumeration response-timing channel): **consciously accepted** — a Supabase-Auth-side characteristic, not app code; the visual no-enumeration requirement (AC #3) is fully met. Valid.
- 🔵 Low (signOut result unchecked): **applied** — now `signOut({ scope: "local" })` with the result captured and a `console.warn` on failure, redirect always proceeds (`reset-password/page.tsx:69-73`). The other two Low items were confirmed no-change-needed by the evaluator (tsconfig exclude is the correct infra-respecting fix; loading-state ordering is correct).

#### Remaining concerns

- None blocking. The Medium 1 breadth (`/reset-password` doubles as an unguarded change-password page for an already-logged-in user) is documented and within spec — a reasonable future hardening follow-up, not a defect for this issue.
- This project has **no automated test runner by design** (per CLAUDE.md §2/§3); the correctness gate is `tsc --noEmit` + `npm run build`, both of which pass. Not treated as a blocker.
- The end-to-end email delivery depends on one-time Supabase/Vercel infra config (Site URL, redirect URLs, Send Email hook + secrets, prod `NEXT_PUBLIC_SITE_URL`) — explicitly out of app-code scope per the PRD. No app-code action outstanding.
- Docs: correctly handled. The README is unmodified `create-next-app` boilerplate with no auth/env/feature sections, and the feature adds no new commands or env vars (reuses existing `NEXT_PUBLIC_SITE_URL`, documented in CLAUDE.md §11). No doc change warranted.

#### Verdict: **READY FOR REVIEW**

All nine acceptance criteria are met and were verified against the live code, not just the reports. The implementation faithfully follows the PRD's prescribed pattern — browser Supabase client from the `(auth)` pages, `useState` error/loading, hard `window.location.href` redirects, the dark/glass card with `DionyLogo`, and the recovery flow routed through the untouched `/api/auth/callback`. The no-enumeration guarantee is structurally enforced (the `resetPasswordForEmail` result is never inspected), the password-match check provably precedes any Supabase call, and the invalid-session and network-error paths each render the specified fallback UI. Every constraint was honored: the callback route and `send-email` edge function were left untouched, no server action or `middleware.ts` was introduced, and the only collateral change (`tsconfig.json` excluding the Deno `supabase/functions` dir) is the minimal, infra-respecting fix that pulls in zero app code and was independently validated by the evaluator. All evaluator findings were addressed — the one Medium hardening applied additively without risking the working flow, the two acceptances justified as Supabase-side/within-spec — and the verification gate (tsc clean + build succeeds with both `○ /forgot-password` and `○ /reset-password`) passes on an independent run. Nothing is missing; this is complete and shippable.

### PR Feedback Summary
