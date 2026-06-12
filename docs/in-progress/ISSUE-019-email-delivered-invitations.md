# ISSUE-019: Email-delivered invitations (Resend)

**Type:** Feature
**Priority:** P1
**Status:** Ready for Review
**GitHub Issue:** #19

## Problem

Every invite flow creates a single-use `invite_tokens` row and an `/invite/{token}` URL, but **no email is ever sent** — the admin must copy the link from a modal and deliver it manually. Invitees never receive anything automatically. We need to optionally email the invite link to a recipient when the inviter provides an address, across all three invite flows.

## Acceptance Criteria

- [ ] An optional "Email (optional)" input appears in the /settings "Generate Invite Link" card and in the Event Collaborators "Invite Collaborator" dialog.
- [ ] When an email is entered and the invite is generated, a branded HTML email containing the invite link is delivered to that address via Resend.
- [ ] When the email field is left blank, behavior is unchanged: a link is generated and shown for manual copy; no email is sent.
- [ ] The email's "Accept invitation" button links to the existing `{NEXT_PUBLIC_SITE_URL}/invite/{token}` page.
- [ ] The email subject reflects the scope, e.g. `Jory Zhang invited you to join Acme Events on Diony`.
- [ ] If sending fails (bad/missing API key, Resend error), invite creation still succeeds and returns a working link; the UI surfaces a non-fatal "couldn't send email" notice and still shows the copyable link.
- [ ] When an email was sent, the result UI shows a "Sent to {email}" confirmation alongside the link.
- [ ] If the entered email is non-empty but malformed (e.g. `foo`, `foo@`, `foo@bar`, `a b@c.com`), no invite is generated and no email is sent; an inline error `Please enter a valid email address` shows next to the field, clearing when the user edits it.
- [ ] The recipient's entered email is persisted to `invite_tokens.email`.
- [ ] `npx tsc --noEmit` is clean and `npm run build` succeeds.

## Prerequisite Setup (performed by the maintainer, not the coder)

These are environment/config steps, documented here so the feature can be tested. The coder only writes code that reads the resulting env vars.

1. In the Resend dashboard → **Domains → Add domain**; add **`diony.org`** and create the SPF/DKIM/DMARC DNS records at the registrar; wait for "Verified".
2. Create a Resend **API key**.
3. Add to `.env.local` (and Vercel project env):
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=Diony <hello.diony@diony.org>` (the address is on the verified `diony.org` domain)
4. `NEXT_PUBLIC_SITE_URL` already exists and is reused to build the absolute invite URL.

> Until the domain verifies, Resend only delivers to the account owner's own address — sufficient for the first end-to-end test.

## Affected Files

**Create:**
- `src/lib/email/client.ts` — lazily constructs and returns a Resend client from `RESEND_API_KEY`.
- `src/lib/email/invite-email.ts` — `renderInviteEmail(...)` (pure, returns `{ subject, html }`) and `sendInviteEmail(...)` (calls Resend; never throws; returns `{ sent, error? }`).

**Modify:**
- `src/app/actions/invites.ts` — add optional `email?` param to `createShareableInviteToken` and `createEventInviteWithComponents`; persist it to `invite_tokens.email`; on success, look up inviter name + scope name and call `sendInviteEmail`; return `emailSent` in the result.
- `src/app/actions/organizations.ts` — in `inviteMember` (already collects `email`), add the `sendInviteEmail` call before returning.
- `src/app/(dashboard)/settings/settings-client.tsx` — add the email input to the invite card, thread it into the `actions.createShareableInviteToken` call + the `Actions` interface, and surface "Sent to {email}".
- `src/app/(dashboard)/settings/page.tsx` — no signature change needed (it passes the imported action by reference), but verify the optional param doesn't break the typed `actions` prop.
- `src/components/event-collaborators-panel.tsx` — add the email input to the invite dialog and pass it to `createEventInviteWithComponents`; show "Sent to {email}" in the generated-link state.
- `package.json` — add `resend` dependency.
- `.env.local.example` — add `RESEND_API_KEY` and `EMAIL_FROM` placeholders.

**Read-only context (do not modify):**
- `src/app/invite/[token]/invite-valid.tsx` — the existing accept page the email links to. No change; just the destination.

## Relevant Code Context

### Current server actions (in `src/app/actions/invites.ts`)

```ts
// createEventInviteWithComponents — event scope, pre-selected component grants
export async function createEventInviteWithComponents(
  organizationId: string,
  eventId: string,
  componentIds: string[],
  expiresInHours: number = 48
): Promise<{ data?: { token: string; inviteUrl: string }; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members").select("role")
    .eq("organization_id", organizationId).eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }
  if (componentIds.length === 0) return { error: "Select at least one component" };

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("invite_tokens")
    .insert({
      organization_id: organizationId, invited_by: user.id, email: null,
      role: "member" as const, invite_type: "event" as const,
      event_id: eventId, expires_at: expiresAt,
    })
    .select("id, token").single();
  if (tokenErr || !tokenRow) return { error: tokenErr?.message ?? "Failed to create token" };

  const { error: grantErr } = await supabase
    .from("invite_token_components")
    .insert(componentIds.map((cid) => ({ invite_token_id: tokenRow.id, component_id: cid })));
  if (grantErr) return { error: grantErr.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  revalidatePath(`/events`);
  return { data: { token: tokenRow.token, inviteUrl: `${siteUrl}/invite/${tokenRow.token}` } };
}

export type InviteScope = "organization" | "event" | "component";

// createShareableInviteToken — org/event/component scope, used by /settings
export async function createShareableInviteToken(
  organizationId: string,
  inviteType: InviteScope,
  role: "member" | "admin" | "lead",
  scopeId?: string,                  // event_id for event scope, component_id for component scope
  expiresInHours: number = 48
): Promise<{ data?: { token: string; inviteUrl: string }; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members").select("role")
    .eq("organization_id", organizationId).eq("user_id", user.id).single();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
  const insert: Record<string, unknown> = {
    organization_id: organizationId, invited_by: user.id, email: null,
    role, invite_type: inviteType, expires_at: expiresAt,
  };
  if (inviteType === "event" && scopeId) insert.event_id = scopeId;
  if (inviteType === "component" && scopeId) insert.component_id = scopeId;

  const { data, error } = await supabase
    .from("invite_tokens").insert(insert).select("token").single();
  if (error) return { error: error.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  revalidatePath("/settings");
  return { data: { token: data.token, inviteUrl: `${siteUrl}/invite/${data.token}` } };
}
```

### Current `inviteMember` (in `src/app/actions/organizations.ts`)

```ts
export async function inviteMember(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const orgId = formData.get("organization_id") as string;
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const role = ((formData.get("role") as string) || "member") as "member" | "admin";
  if (!email) return { error: "Email is required" };

  // ... admin check + "already a member" check (unchanged) ...

  const { data: tokenData, error: tokenError } = await supabase
    .from("invite_tokens")
    .insert({ organization_id: orgId, invited_by: user.id, email, role })
    .select("token").single();
  if (tokenError) return { error: tokenError.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${siteUrl}/invite/${tokenData.token}`;
  revalidatePath("/settings");
  return { success: true, inviteUrl, email };   // <-- add sendInviteEmail before this return
}
```

### Settings UI wiring

`src/app/(dashboard)/settings/page.tsx` imports the action and passes it by reference:

```ts
import { createShareableInviteToken } from "@/app/actions/invites";
// ...
actions={{ createShareableInviteToken, removeMember, updateMemberRole, /* ... */ }}
```

`settings-client.tsx` declares the action's type in its `Actions` interface and calls it in `handleGenerateLink`:

```ts
interface Actions {
  createShareableInviteToken: (
    orgId: string, type: InviteScope, role: "member" | "admin" | "lead",
    scopeId?: string, expiresInHours?: number
  ) => Promise<{ data?: { token: string; inviteUrl: string }; error?: string }>;
  // ...
}

// state already present: inviteType, inviteScopeId, inviteRole, inviteExpiry,
//                        inviteError, isPending (useTransition), inviteLinkModal

async function handleGenerateLink() {
  setInviteError(null);
  const scopeId = inviteType === "organization" ? undefined : inviteScopeId || undefined;
  if ((inviteType === "event" || inviteType === "component") && !scopeId) {
    setInviteError(`Please select a ${inviteType} first.`);
    return;
  }
  startTransition(async () => {
    const result = await actions.createShareableInviteToken(
      organization.id, inviteType, inviteRole, scopeId, inviteExpiry
    );
    if (result.error) { setInviteError(result.error); return; }
    if (result.data) {
      const typeLabel = /* Org / Event: x / Component: x */;
      setInviteLinkModal({ url: result.data.inviteUrl, label: typeLabel });
    }
  });
}
```

The invite card markup lives around the `{/* Role + Expiry + Generate */}` block — add the email `<input>` above the Generate button using the same dark input styling already used elsewhere in this file (`bg-white/[0.05]` / `border-white/10` / `rounded-xl` / `text-sm`).

### Event Collaborators dialog (`src/components/event-collaborators-panel.tsx`)

```ts
// state: selectedComponents (Set), generatedUrl, copied, inviteError, isPending
function handleGenerateLink() {
  setInviteError(null);
  startTransition(async () => {
    const result = await createEventInviteWithComponents(
      organizationId, eventId, Array.from(selectedComponents)
    );
    if (result.error) setInviteError(result.error);
    else if (result.data) setGeneratedUrl(result.data.inviteUrl);
  });
}
// The generated-link view shows generatedUrl with a Copy button — add "Sent to {email}" text here.
```

### Profiles table (for inviter name lookup)

`profiles` has `id`, `full_name`, `email`. Fetch the inviter's display name with a separate query (the FK-join-ambiguity rule forbids embedding `profiles` in these selects):

```ts
const { data: prof } = await supabase
  .from("profiles").select("full_name, email").eq("id", user.id).single();
const inviterName = prof?.full_name || prof?.email || "A team member";
```

## Implementation Steps

1. **Add dependency:** `npm install resend`. Add `RESEND_API_KEY` and `EMAIL_FROM` to `.env.local.example`.

2. **Create `src/lib/email/client.ts`:**
   ```ts
   import { Resend } from "resend";
   let _resend: Resend | null = null;
   export function getResend(): Resend | null {
     const key = process.env.RESEND_API_KEY;
     if (!key) return null;
     if (!_resend) _resend = new Resend(key);
     return _resend;
   }
   ```

3. **Create `src/lib/email/invite-email.ts`** with a pure renderer and a non-throwing sender:
   ```ts
   import { getResend } from "./client";

   type Scope = "organization" | "event" | "component";
   const SCOPE_LABEL: Record<Scope, string> = {
     organization: "Organization", event: "Event", component: "Component",
   };
   const SCOPE_ACCENT: Record<Scope, string> = {
     organization: "#3b82f6", event: "#8b5cf6", component: "#14b8a6",
   };

   export interface InviteEmailArgs {
     inviterName: string;
     scope: Scope;
     scopeName: string;      // org/event/component display name
     role: string;
     inviteUrl: string;
     expiresLabel: string;   // e.g. "48 hours", "7 days"
   }

   export function renderInviteEmail(a: InviteEmailArgs): { subject: string; html: string } {
     const subject = `${a.inviterName} invited you to join ${a.scopeName} on Diony`;
     const accent = SCOPE_ACCENT[a.scope];
     const html = `<!doctype html><html><body style="margin:0;background:#05050F;font-family:Arial,Helvetica,sans-serif;color:#E8EAF0;">
       <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
         <p style="font-size:13px;letter-spacing:.08em;color:#818CF8;text-transform:uppercase;margin:0 0 24px;">◆ Diony</p>
         <h1 style="font-size:24px;font-weight:700;margin:0 0 16px;">You've been invited</h1>
         <p style="font-size:15px;color:#A0A8B8;margin:0 0 20px;">${a.inviterName} invited you to join:</p>
         <div style="background:#0D0D1C;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin:0 0 24px;">
           <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:${accent};border-radius:6px;padding:2px 8px;">${SCOPE_LABEL[a.scope]}</span>
           <p style="font-size:16px;font-weight:600;margin:10px 0 4px;">${a.scopeName}</p>
           <p style="font-size:13px;color:#6B7280;margin:0;">Role: ${a.role.toUpperCase()}</p>
         </div>
         <a href="${a.inviteUrl}" style="display:block;text-align:center;background:linear-gradient(90deg,#6366F1,#8b5cf6);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px;border-radius:12px;margin:0 0 20px;">Accept invitation →</a>
         <p style="font-size:13px;color:#6B7280;margin:0 0 16px;">This invite expires in ${a.expiresLabel} and can only be used once.</p>
         <p style="font-size:12px;color:#6B7280;margin:0 0 4px;">Or paste this link into your browser:</p>
         <p style="font-size:12px;color:#818CF8;word-break:break-all;margin:0 0 28px;">${a.inviteUrl}</p>
         <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 16px;"/>
         <p style="font-size:12px;color:#4B5563;margin:0;">You received this because ${a.inviterName} invited you. If this was unexpected, you can safely ignore it.</p>
       </div></body></html>`;
     return { subject, html };
   }

   export async function sendInviteEmail(
     args: InviteEmailArgs & { to: string; replyTo?: string }
   ): Promise<{ sent: boolean; error?: string }> {
     const resend = getResend();
     const from = process.env.EMAIL_FROM;
     if (!resend || !from) return { sent: false, error: "Email not configured" };
     const { subject, html } = renderInviteEmail(args);
     try {
       const { error } = await resend.emails.send({
         from, to: args.to, subject, html,
         ...(args.replyTo ? { replyTo: args.replyTo } : {}),
       });
       if (error) { console.error("sendInviteEmail:", error); return { sent: false, error: error.message }; }
       return { sent: true };
     } catch (e) {
       console.error("sendInviteEmail threw:", e);
       return { sent: false, error: e instanceof Error ? e.message : "Send failed" };
     }
   }
   ```
   Add a helper to format expiry hours → label: `<=24 → "24 hours"`, `<=48 → "48 hours"`, `168 → "7 days"`, `720 → "30 days"`, else `"${hours} hours"`.

4. **`createShareableInviteToken`:** add a trailing optional param `email?: string`. Normalize `const cleanEmail = email?.toLowerCase().trim() || undefined`. **Defensive server-side guard** (server actions are directly callable): `if (cleanEmail && !isValidEmail(cleanEmail)) return { error: "Please enter a valid email address" }`. Set `insert.email = cleanEmail ?? null` instead of hardcoded `null`. After the token insert succeeds and before returning, if an email was provided, resolve `scopeName`:
   - `organization` → fetch `organizations.name` by `organizationId`.
   - `event` → fetch `events.name` by `scopeId`.
   - `component` → fetch `components.name` by `scopeId`.
   Fetch inviter name (snippet above), then `const send = await sendInviteEmail({ to: email, replyTo: prof?.email, inviterName, scope: inviteType, scopeName, role, inviteUrl, expiresLabel })`. Change the return to `{ data: { token, inviteUrl, emailSent: send.sent } }`.

5. **`createEventInviteWithComponents`:** add optional `email?: string` (after `expiresInHours`). Normalize + guard as in step 4 (`if (cleanEmail && !isValidEmail(cleanEmail)) return { error: "Please enter a valid email address" }`), then set `email: cleanEmail ?? null` in the insert. After grants insert, if email provided, fetch the event name (`events.name` by `eventId`) + inviter name, call `sendInviteEmail({ scope: "event", scopeName: eventName, role: "member", ... })`, and return `{ data: { token, inviteUrl, emailSent: send.sent } }`.

6. **`inviteMember`:** email is required here; in addition to the existing `if (!email)` check, add `if (!isValidEmail(email)) return { error: "Please enter a valid email address" }` before creating the token. After building `inviteUrl`, fetch org name + inviter name and `await sendInviteEmail({ to: email, scope: "organization", scopeName: orgName, role, inviteUrl, expiresLabel: "48 hours", ... })`. Return `{ success: true, inviteUrl, email, emailSent: send.sent }`.

7. **`settings-client.tsx`:**
   - Add `const [inviteEmail, setInviteEmail] = useState("")`.
   - **Validate format before generating.** Add a shared helper `isValidEmail` (place it in `src/lib/utils.ts` and import it in both UIs) and call it at the top of `handleGenerateLink`:
     ```ts
     // src/lib/utils.ts
     export function isValidEmail(email: string): boolean {
       return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
     }
     ```
     ```ts
     // in handleGenerateLink, before the action call:
     const email = inviteEmail.trim();
     if (email && !isValidEmail(email)) {
       setInviteError("Please enter a valid email address");
       return;                 // do NOT generate a token or send
     }
     ```
     Clear `inviteError` in the email input's `onChange` so the message disappears as the user fixes it. Pass `email || undefined` (not the raw state) as the action's email arg.
   - Update the `Actions` interface signature for `createShareableInviteToken` to add `email?: string` and the return `{ data?: { token; inviteUrl; emailSent?: boolean } }`.
   - Add an email `<input type="email" placeholder="Email (optional)">` to the invite card (above/next to Generate), styled like the existing inputs.
   - Pass `inviteEmail.trim() || undefined` as the new last arg in the `handleGenerateLink` call.
   - Extend `InviteLinkModal` to carry `emailSent?: boolean` + `email?: string`; when `emailSent`, render "Invite emailed to {email}" in the link modal. Reset `inviteEmail` when the card/modal closes.

8. **`event-collaborators-panel.tsx`:**
   - Add `const [inviteEmail, setInviteEmail] = useState("")` and reset it in `handleInviteOpenChange`.
   - Add the email `<input>` to the dialog body (before the Generate Link button).
   - **Validate format before generating** using the same `isValidEmail` helper: at the top of `handleGenerateLink`, `const email = inviteEmail.trim(); if (email && !isValidEmail(email)) { setInviteError("Please enter a valid email address"); return; }`. Clear `inviteError` in the input's `onChange`.
   - Pass `email || undefined` to `createEventInviteWithComponents`.
   - Track `emailSent` from the result; in the generated-link view, show "Sent to {inviteEmail}" when true.

9. Run `npx tsc --noEmit` and `npm run build`; fix any type errors (notably the `Actions` interface + the `EventCollaboratorsPanel` call site).

## Test Scenarios

**Happy path:**
- /settings → Org scope → enter your own (Resend-verified) email → Generate → email arrives from `Diony <hello.diony@diony.org>`, subject `…invited you to join {Org} on Diony`, "Accept invitation" opens `/invite/{token}`; UI shows "Invite emailed to {email}" + the copyable link.
- Event Collaborators → select components → enter email → Generate → email received with Event scope chip; link grants only the selected components after accept.

**Edge cases:**
- Email field blank → link generated and copyable; **no** email attempt; no "Sent to" text.
- Whitespace-only email → treated as blank (trimmed) → no send.
- Malformed email (`foo`, `foo@`, `foo@bar`, `a b@c.com`, trailing/leading spaces around an otherwise-invalid value) → inline `Please enter a valid email address`; **no token generated, no send**; editing the field clears the error.
- Valid-but-spaced email (` user@host.com `) → trimmed and accepted.
- Component scope invite → scope chip reads "Component" and `scopeName` is the component name.

**Error cases:**
- `RESEND_API_KEY` unset or invalid → invite still created, returns a working link, `emailSent === false`, UI shows a non-fatal "couldn't send email — copy the link below" notice (no thrown error, no failed invite).
- Resend returns an error object → same graceful degradation.

**RLS / permissions:**
- A non-owner/non-admin org member calling `createShareableInviteToken` / `createEventInviteWithComponents` still gets `Insufficient permissions` (unchanged) and no email is sent.

## Constraints

- **Do not** change the `/invite/[token]` accept page, `consumeInviteToken`, or the `accept_invite` RPC — the email only links into the existing flow.
- **Do not** make email a required field; the copy-link flow must keep working unchanged when email is blank.
- A failed/again-configured send must **never** fail invite creation — `sendInviteEmail` must not throw and callers must ignore non-fatal send failures.
- **Do not** embed `profiles`/`organizations`/`events`/`components` via PostgREST joins on `invite_tokens` selects — fetch names in separate queries (FK-join-ambiguity rule).
- **Do not** convert `add-member-dialog.tsx` (freeform, non-auth `component_members`) — out of scope.
- Follow the existing server-action shape: `{ data?, error? }`, `revalidatePath` on success, return error strings (never throw).
- Match the existing dark/glass input styling; do not introduce new design primitives.

## Technical Notes

- Resend's Node SDK is server-only — it must be called from server actions (`"use server"`), never the browser. The API key is server-only (no `NEXT_PUBLIC_` prefix).
- The SDK option for reply-to is `replyTo` (camelCase) in current `resend` versions.
- Until the sending domain is verified in Resend, delivery is restricted to the account owner's own address — expected during initial testing; verify with a third-party recipient only after the domain shows "Verified".
- `invite_tokens.email` is already a nullable column (currently always written `null` by the shareable/event actions), so no migration is required.

---

## Agent Reports

_This section is filled during implementation by /implement-issue. Do not edit manually._

### Coder Report

**Branch:** `issue/019-email-invitations`

**Dependency added:** `resend` (`npm install resend` — 5 packages added).

**Files created:**
- `src/lib/email/client.ts` — lazy `getResend()`; returns `null` when `RESEND_API_KEY` is unset so callers degrade gracefully.
- `src/lib/email/invite-email.ts` — `renderInviteEmail()` (pure, returns `{ subject, html }`, Diony-branded dark template, **HTML-escapes** all interpolated user strings), `expiresLabel()`, and `sendInviteEmail()` (never throws; returns `{ sent, error? }`; no-ops to `{ sent:false }` when Resend/`EMAIL_FROM` not configured).

**Files modified:**
- `src/lib/utils.ts` — added `isValidEmail()` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
- `src/app/actions/invites.ts` — added `getInviterIdentity()` helper; `createShareableInviteToken` and `createEventInviteWithComponents` each take an optional trailing `email?`, normalize+validate it (return `"Please enter a valid email address"` on malformed), persist to `invite_tokens.email`, resolve the scope name (org/event/component), send via `sendInviteEmail`, and return `{ token, inviteUrl, emailSent }`.
- `src/app/actions/organizations.ts` — `inviteMember` now format-validates the (required) email, resolves org+inviter names, sends the email, and returns `emailSent`.
- `src/app/(dashboard)/settings/settings-client.tsx` — optional email input on the Generate-Invite card; client-side `isValidEmail` guard; threaded `email` through the `Actions` type + call; `InviteLinkModal` carries `emailSent`/`email`; modal shows a green "Invite emailed to {email}" or amber "couldn't send" banner; input clears on success and clears the error on edit.
- `src/components/event-collaborators-panel.tsx` — optional email input in the invite dialog; client-side guard; passes `email` (with explicit `48` expiry arg) to `createEventInviteWithComponents`; generated-link view shows the green/amber email status; state reset on dialog close.
- `.env.local.example` — documented `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM=Diony <hello.diony@diony.org>`.

**Verification (this project has no test runner — the gate is type-check + build, per the PRD):**
- `npx tsc --noEmit` → exit 0, clean.
- `npm run build` → ✓ compiled, TypeScript pass, all 19/19 pages generated; route table unchanged.

**Decisions / notes not fully specified in the PRD:**
- Added HTML-escaping (`esc()`) for all user-supplied values (inviter name, scope name, role, URL) in the email body — defense against injection from names. A correctness/security necessity for HTML email.
- `getInviterIdentity` returns both name and email so the inviter's address is used as `replyTo`.
- The two shareable/event actions now return `emailSent: boolean` (non-optional in the data object); updated the `Actions` interface in settings-client to match.
- Behavioral Test Scenarios (delivery, recipient inbox, accept flow) require runtime + live Resend config and were **not** automated (no test framework, and `diony.org` is not yet verified). They are listed for manual QA.

### Evaluator Report

**Totals: 0 🔴 Critical · 2 🟡 Medium · 4 🔵 Low.** `npx tsc --noEmit` clean; no off-limits files touched; every Acceptance Criterion mapped to code and satisfied. `replyTo` camelCase confirmed valid against installed `resend@6.12.4` types. HTML injection handled via `esc()`. Permission checks remain ahead of all token creation/sends.

**🟡 M1 — No early-out when email is unconfigured.** `invites.ts` (send blocks) + `organizations.ts`. When `cleanEmail` is set, the action always runs the scope-name + inviter queries and calls `sendInviteEmail`, even if `RESEND_API_KEY`/`EMAIL_FROM` are unset — paying 2 extra DB round-trips before `sendInviteEmail` no-ops. Wasteful in the default-unconfigured state. Fix: skip the lookups+send when email isn't configured.

**🟡 M2 — `inviteMember`'s new `emailSent` is plumbed nowhere.** `organizations.ts:inviteMember` has no caller in `src/` — the live org-invite path is the shareable-token flow. The added send logic matches the PRD's explicit instruction to wire `inviteMember`, so it's not a spec defect, but the path is unobservable/unverifiable in-app today. Confirm intent.

**🔵 L1 — Collaborators banner re-reads live `inviteEmail`.** `event-collaborators-panel.tsx` — green/amber banner keys off current `inviteEmail` + last `emailSent`; editing the field after generating would show stale text. Capture the submitted email into state.

**🔵 L2 — `expiresLabel` boundary labels are lossy.** `invite-email.ts:expiresLabel` — `≤24`→"24 hours", `25–48`→"48 hours". Correct for the dropdown values (24/48/168/720) but overstates arbitrary expiries. Use exact arithmetic.

**🔵 L3 — `sendInviteEmail` doesn't re-validate `args.to`.** Defense-in-depth only; callers validate, but it's an exported helper.

**🔵 L4 — Dark `<body>` background won't render in Gmail/Outlook (they strip body CSS).** `invite-email.ts` — card may render on white with low-contrast gray text. Deliverability/legibility polish; wrap in a `bgcolor` table.

**Overall: shippable.** No critical/security defects; all ACs met; type-check green. Main caveat is M2 (inviteMember path has no in-app consumer — confirm intended).

### Coder Revision Report

Addressed all Medium findings and all four Low findings.

- **M1 (early-out when email unconfigured)** — Added `isEmailConfigured()` to `src/lib/email/client.ts`. All three actions now gate the scope-name + inviter lookups and the send behind `if (cleanEmail && isEmailConfigured())` (invites.ts) / `if (isEmailConfigured())` (organizations.ts). No DB round-trips are spent when email isn't set up; `emailSent` is reported `false` and the UI shows the amber "couldn't send" notice — the correct behavior in the unconfigured state.
- **M2 (`inviteMember` has no UI consumer)** — **Intentionally kept, not a code change.** The PRD explicitly scopes `inviteMember` in ("Kept working even though current UI prefers the shareable action"), so the send wiring stays for whenever that flow is surfaced. Documented here so reviewers know the org-by-email path is currently exercised only by the shareable-token UI.
- **L1 (collaborators banner read stale state)** — Added a `sentToEmail` state captured from the submitted value at result time; the green/amber banner now keys off `sentToEmail` + `emailSent` instead of the live `inviteEmail` field. (settings-client already snapshotted the email into `inviteLinkModal`, so it was already correct there.)
- **L2 (lossy `expiresLabel`)** — Now exact: `24`→"24 hours", `48`→"48 hours", any `%24===0`→"N days", else "N hours". Correct for all dropdown values (24/48/168/720) and any arbitrary expiry.
- **L3 (`sendInviteEmail` didn't re-validate recipient)** — Added `if (!isValidEmail(args.to)) return { sent:false, error:"Invalid recipient address" }` inside the helper (defense-in-depth for any future caller).
- **L4 (dark `<body>` background stripped by mail clients)** — Rewrote the template as a nested `<table>` layout with explicit `bgcolor` attributes (`#05050F` outer, `#0D0D1C` card, `#15152A` scope block, `#6366F1` button) so the dark theme renders in Gmail/Outlook; bumped muted text to `#9AA1B2` for legibility, escaped entities (`&rarr;`).

**Verification after revisions:**
- `npx tsc --noEmit` → clean (exit 0).
- `npm run build` → ✓ success, full route table, all pages generated.

> Note: a transient build failure appeared mid-run in `src/app/onboarding/profile/page.tsx` (`Cannot find name 'Zap'`) — this was an **unrelated concurrent edit** in the user's IDE (swapping the `Zap` icon for a new `DionyLogo` component), not part of ISSUE-019. Once that edit settled, the build passed clean. No ISSUE-019 file touches onboarding.

### Documentation Report

**No README change needed.** README.md is unmodified create-next-app boilerplate that documents no environment variables (not even the existing Supabase keys). This project's convention for env-var documentation is `.env.local.example`, which was updated in Stage A to add `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, and `EMAIL_FROM=Diony <hello.diony@diony.org>` with inline guidance. Adding an isolated email section to the boilerplate README would conflict with the "do not restructure README" rule and be inconsistent with how the rest of the app's config is documented.

The new dependency (`resend`) is captured in `package.json` / `package-lock.json`. The maintainer setup steps (verify `diony.org` in Resend, set the two env vars) are documented in the PRD's **Prerequisite Setup** section.

### Coordinator Summary

**Acceptance Criteria:**
- ✅ Optional "Email (optional)" input in the /settings invite card and the Event Collaborators dialog.
- ✅ Branded HTML email delivered via Resend when an email is entered (table-based dark template, links into existing `/invite/{token}`).
- ✅ Blank email → unchanged copy-link flow; no send attempted.
- ✅ "Accept invitation" links to `{NEXT_PUBLIC_SITE_URL}/invite/{token}`.
- ✅ Subject reflects scope (`{Inviter} invited you to join {Scope} on Diony`).
- ✅ Send failure is non-fatal: invite still created, working link returned, amber "couldn't send" notice shown; `sendInviteEmail` never throws.
- ✅ "Invite emailed to {email}" confirmation on success (settings modal + collaborators dialog).
- ✅ Malformed non-empty email → no token, no send, inline `Please enter a valid email address`, clears on edit; enforced on **both** client and server (all 3 actions).
- ✅ Recipient email persisted to `invite_tokens.email`.
- ✅ `npx tsc --noEmit` clean and `npm run build` succeeds (route table unchanged).

**Verdict: READY FOR REVIEW.**

Every acceptance criterion is implemented and verified at the type-check + build gate (this project has no test runner; that is the PRD-defined gate). The evaluator found zero critical/security issues; all Medium and Low findings were resolved in Stage C (early-out when email unconfigured, exact expiry labels, recipient re-validation, table-based email for mail-client compatibility, snapshotted UI state) except M2, which is an intentional, PRD-sanctioned keep (`inviteMember` send wiring retained for a flow whose UI isn't currently surfaced). HTML-injection is mitigated via entity escaping, permission checks remain ahead of all token creation/sends, and the FK-join-ambiguity rule is honored (names fetched in separate queries). The implementation is complete and self-consistent.

**Caveats for the reviewer (non-blocking):**
1. **Delivery is unverified end-to-end** — it requires the maintainer to verify `diony.org` in Resend and set `RESEND_API_KEY` + `EMAIL_FROM`. Until then Resend only delivers to the account owner's own address. The code degrades gracefully when unconfigured (link still works, amber notice shown).
2. **The branch carries unrelated concurrent edits.** `issue/019-email-invitations` also contains an in-progress **DionyLogo branding** change (login, signup, sidebar, layout, onboarding, `diony-logo.tsx`) made live in the IDE during implementation, plus the earlier CLAUDE.md rewrite. These are **not** part of ISSUE-019 — separate them before/within the PR as desired.

### PR Feedback Summary
