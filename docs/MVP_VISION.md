# MVP Vision — Event Coordination Platform

> The operational spine for event teams — where planning, people, and execution converge in one place.

---

## 1. The Problem

Event planning teams of 4–5 people routinely coordinate 6–18 contractor types, manage budgets of $50K–$500K, and deliver high-stakes public experiences — using a patchwork of 5–7 disconnected tools. The result is coordination failures: missed updates, scattered documents, vendors who don't get the brief, and planners who overpay for repeat vendors because there's no way to evaluate alternatives.

Existing software falls into three buckets, each solving a fraction of the problem:

- **Event-specific tools** (Planning Pod, Aisle Planner) understand the domain but have flat collaboration models and dated UX.
- **Client CRMs** (HoneyBook, Dubsado) manage the business side but are blind to the operational coordination that delivers events.
- **Horizontal PM tools** (Monday.com, Asana, Airtable) offer strong collaboration but require weeks of DIY setup with zero domain knowledge.

No platform combines event-domain specificity, multi-tier stakeholder coordination, and modular architecture. This is the gap.

---

## 2. The Solution

Three distinguishing principles:

1. **Component-based architecture:** Reusable, composable modules (Finance, Logistics, Marketing, Volunteers) that assemble differently per event. Components are flat and reusable (the "what"); hierarchy lives within specific project instances (the "when").

2. **Tiered stakeholder access:** Four distinct roles (organizer, internal collaborator, external partner, volunteer/execution worker) with scoped visibility and permissions — not flat guest access.

3. **Contractor lifecycle as a first-class feature:** From quote pipeline to onboarding to day-of execution to post-event rating — built into the event structure, not bolted on. The mechanism that eliminates the trust premium and unlocks measurable cost savings.

---

## 3. The Trust Premium Thesis

Planners consistently choose repeat vendors over cheaper alternatives — even when the cost difference is 15–25% — because the risk of a bad vendor on event day is catastrophic. This "trust premium" exists because of two information failures:

1. **No reputation visibility:** No verified reviews from other event professionals. Planners stick with who they know.
2. **No onboarding infrastructure:** New vendors don't know the flow. Even competent new vendors feel worse than repeat ones.

The platform breaks both failures:
- **Verified reputation** (ratings from real engagements) lets planners evaluate new vendors with confidence.
- **Onboarding packets and run sheets** close the day-of performance gap between new and returning vendors.

**Economic argument:** If the average mid-size event spends $50K–$100K on contractors, and the platform helps planners confidently switch to competitive options on 3–4 vendor slots, that's $5K–$15K saved per event. The platform pays for itself on the first event.

---

## 4. Target Personas

Informed by two user interviews:

| | Persona A: Event Planning Company | Persona B: Event-Hosting Organization |
|---|---|---|
| **Example** | Bonfire Events | CCC |
| **Team** | 4–5 generalists | 4–5 specialists (directors) |
| **Events** | Community festivals, public events | Markets, festivals, periodic public events |
| **Contractor model** | Hires vendors directly | Hires event planning partner + direct vendors |
| **Contractors/event** | 6–10 types | 15–20 types |
| **Core need** | Replace 5+ tools, reduce day-of chaos | Vendor cost control, coordination visibility |

Both share: small teams, large contractor rosters, repeating event formats, fragmented tool stacks, trust-based vendor selection with cost premium, and explicit demand for "all in one place."

---

## 5. What the MVP Replaces

| Current Tool | Used For | Pain Point | MVP Replacement |
|---|---|---|---|
| Asana / Trello | Task management, Kanban | No event domain, no vendor model | Event projects with components + tasks |
| Google Sheets / Excel | Vendor tracking, budgets | No structure, manual, error-prone | Contractor registry + event budgets |
| Cognito Forms | Data collection | Disconnected from workflow | Integrated forms within event context |
| Email / Text / Phone | Vendor communication | Fragmented, no record | Status pipeline with notes + files |
| Google Drive / Dropbox | File sharing, docs | No event context, scattered | Files attached to events + engagements |
| draw.io / AutoCAD | Site maps | Disconnected from event data | Site map uploads within event context (v1) |

The MVP does not need to be better than each tool individually. It needs to be good enough at each function while being dramatically better at connecting them. The value is in the connections, not the components.

---

## 6. MVP Scope: Four Milestones

| Milestone | Focus | Delivers | Validates |
|---|---|---|---|
| **M1** | Event core | Projects, components, tasks, templates, budgets | "All in one place" value prop |
| **M2** | Contractor foundation | Registry, multi-quote pipeline, status tracker, doc tracker | Cost comparison + vendor management |
| **M3** | Execution layer | Onboarding packets, run sheets, post-event ratings | Trust premium reduction + day-of value |
| **M4** | Access & collaboration | Tiered roles, smart links, team dashboard | Multi-stakeholder coordination |

---

### M1: Event Core

**Goal:** Replace Asana + Google Sheets + Google Drive as the event coordination backbone.

#### Event Projects
Each event is a project: a container with a name, dates, description, status, and a set of components. Projects can be created from scratch or cloned from a previous event (the template mechanism). The project is the top-level organizational unit.

#### Components
Components are the modular building blocks within an event project: Finance, Logistics, Marketing, Volunteers, Catering, A/V, Security, etc. Components are flat and reusable — a planner defines their component library once, then assembles different combinations per event. Each component contains its own tasks, files, notes, and budget line items. Components are user-defined, not platform-imposed.

**Architecture principle:** Components are like labels — flat and reusable. Hierarchy lives within the project instance. "Finance" as a component is the same building block whether it's a festival or a gala. How it's configured for a specific event is the project-level concern.

#### Tasks
Tasks live within components. Each task has: title, description, assignee(s), due date, status (to-do / in-progress / done), priority, and file attachments. Tasks support basic dependencies (blocked by). Views include list, Kanban board, and calendar. Tasks are the atomic unit of work.

#### Budgets
Per-component budget tracking: line items with estimated vs. actual amounts, vendor assignment, and status (estimated / quoted / committed / paid). The event-level budget is the sum of component budgets. Budget dashboard shows total, by component, and variance (estimated vs. actual).

#### Event Templates
Clone any past event as a template. The clone carries forward: component structure, task lists (with assignees cleared), budget line items (with amounts as estimates), and the contractor roster (as suggested re-invitations). This saves weeks of repeated setup for recurring event formats.

**Definition of done:** A planner can create an event, organize work by component, assign tasks, track budgets, and clone the event for next time. This replaces the Asana + Sheets + Drive combination.

---

### M2: Contractor Foundation

**Goal:** Replace spreadsheet-based vendor tracking with a structured contractor registry, multi-quote pipeline, and engagement tracker. This is where cost savings data begins accumulating.

#### Contractor Data Model

Three layers, following the same architecture as components (flat entity + project-scoped context):

**Layer 1 — Universal Contractor Profile (the entity):**
One form for all contractor types. Fields:
- Identity: name, business name, contact info, location
- Documents: W9 status, insurance certificate, certifications
- Financial: default payment terms, preferred invoicing method, rate history
- Specialization tags: multi-select from user-defined taxonomy (AV, Security, Staging, Catering, etc.) — contractors can hold multiple tags
- Portfolio: links to past work, website
- Platform data (auto-populated): aggregate rating, events completed, on-time rate, average quote, last engagement date

**Layer 2 — Specialization Tags (the labels):**
Tags are user-defined, not platform-imposed. Each organization manages its own taxonomy. A contractor can hold multiple tags. Tags enable filtering without forcing rigid categories.

**Layer 3 — Event Assignment (the context):**
When a contractor is assigned to an event, the assignment record (join table: `event_contractors`) carries:
- Role on this event
- Quoted rate and agreed terms
- Event-specific brief and requirements
- Deliverables and deadlines
- Run sheet / day-of tasks
- Post-event rating and notes

Same contractor gets different context per event. Profile and tags stay constant — assignment context changes.

#### Contractor Registry
Universal profile form with CSV bulk import. Organization-scoped roster. Filter and search by tag, rating, last engagement, price range.

#### Multi-Quote Pipeline
Per-event vendor slots with 1–5 candidates each. Each candidate tracked through: **Requested → Quoted → Negotiating → Agreed → Signed → Declined**. Planner logs amounts, notes, and files at each stage. Quote comparison view shows price alongside contractor rating and history — making the cost-vs-trust trade-off visible and data-informed. Winner selection auto-populates the event budget line item.

#### Engagement Status Tracker
Post-selection lifecycle: **Assigned → Requirements Shared → Confirmed → In Progress → Completed → Paid**. Per-event dashboard showing aggregate contractor status. Kanban or list view.

#### Document & Invoice Tracker
Per-engagement document checklist (W9, insurance, contract, invoice) with file upload and status toggles. Compliance dashboard per event. Payment tracking: submitted → approved → paid.

**Definition of done:** A planner can manage their full contractor roster, run competitive quotes for each vendor slot, track engagement status, and monitor document compliance — replacing spreadsheets and email.

---

### M3: Execution Layer

**Goal:** Bridge the gap between planning and event day. Directly attack the trust premium by making new vendors perform comparably to repeat vendors through standardized onboarding and run sheets.

#### Onboarding Packets
Per-engagement onboarding packet, shareable via smart link (no account required). Contents: event overview, role and responsibilities, site map, key contacts, relevant timeline, attached documents. For returning contractors, auto-populated with diff view ("what's changed since last time"). Read receipt tracking.

**Cost savings hook:** The returning contractor diff view means a vendor who has worked one event on the platform is nearly as easy to onboard as a vendor the planner has used for years — the platform carries the institutional knowledge, not the planner's memory.

**Definition of done:** New contractor onboarding packet assembled in <10 minutes. Returning contractor packet pre-filled in <2 minutes.

#### Day-of Run Sheets
Per-role, per-event chronological instruction list, mobile-optimized. Example:

> 6:00 AM — Arrive Gate C. Check in with Jenny (555-0123).
> 6:15 AM — Unload staging from Truck 2 to Zone B (see map).
> 7:00 AM — Assembly complete. Report to sound check.

Auto-generated from event tasks filtered by assignee, editable with manual overrides, shareable via link, real-time updates. Embedded contact directory.

**Cost savings hook:** Run sheets are the equalizer. A first-time contractor with a clear run sheet performs comparably to a repeat vendor running on memory. This is what makes it safe to choose the $2,400 option over the $3,200 one.

**Definition of done:** A load-in contractor arrives, opens a link on their phone, and knows exactly where to go, what to do, and who to contact — without asking the planner a single question.

#### Post-Event Ratings
Per-contractor, multi-dimensional rating after event close: quality (1–5), reliability (1–5), communication (1–5), free-text notes. Aggregate scores on contractor profile. Engagement history timeline searchable across events.

**Definition of done:** Any contractor profile shows complete engagement history with ratings, cost data, and notes — the institutional knowledge that currently lives in people's heads.

---

### M4: Access & Collaboration

**Goal:** Implement the tiered access model that makes this a true multi-stakeholder coordination platform, not a single-user tool.

#### Four Access Tiers

| Tier | Who | Sees | Can Do |
|---|---|---|---|
| **Organizer** | Business owner, executive director | Everything: all components, budgets, contractors, team activity | Full CRUD, invite/remove members, manage billing |
| **Internal Collaborator** | Core team members (marketing dir, ops dir, coordinator) | Assigned components + cross-component views granted by organizer | Manage tasks, contractors, and budgets within scope |
| **External Partner** | Event planning partner, key vendors, sponsors | Specific components or engagement details shared with them | View shared items, upload files, update status on their tasks |
| **Execution Worker** | Day-of contractors, volunteers | Their run sheet, their onboarding packet, relevant contacts | View instructions, mark tasks complete, access contact info |

**Interview validation:** CCC's structure maps directly: executive director = organizer; directors = internal collaborators; event planning partner = external partner; day-of contractors = execution workers.

#### Smart Links
Shareable links for onboarding packets, run sheets, and limited event views. No account required for read-only access. Each link is scoped to specific content and can be revoked. Basic URL previews.

#### Team Dashboard
Organizer-level view: all active events with status summaries, team member workload across events, contractor engagement status aggregated, upcoming deadlines and at-risk items.

**Definition of done:** An organizer can invite team members with scoped access, share onboarding materials with contractors via links, and see cross-event status in one dashboard. CCC's 3-tier coordination chain (org → event partner → vendors) works natively.

---

## 7. Explicitly NOT in MVP

| Feature | Why Deferred | When It Returns |
|---|---|---|
| Contractor accounts | Requires adoption momentum; run sheets build this first | Post-MVP Phase 3 |
| Threaded communications | Two-sided; needs contractor accounts | Post-MVP Phase 3 |
| In-platform quoting | Two-sided; contractors must submit quotes | Post-MVP Phase 3 |
| AI features | Needs 6+ months of data to be useful, not gimmicky | Post-MVP Phase 4 |
| Marketplace | Needs critical mass of contractors with verified reputation | Post-MVP Phase 5 |
| Mobile app | Run sheets are mobile-web; native app deferred for demand signal | Based on usage data |
| Platform default templates | User-created only; avoids premature assumptions | After learning event types users create |
| API integrations (Google, Figma, Gmail) | Core coordination must work standalone first | Post-MVP Integrations Sprint |
| Task handoff automation | Manual in MVP; automation after patterns are understood | Based on workflow patterns |
| Site map builder | Upload + embed sufficient (both interviews use external tools) | Based on demand signal |

---

## 8. Technical Foundation

### Stack
- **Frontend:** Next.js 14+ App Router, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (PostgreSQL + Row Level Security + Auth)
- **Deployment:** Vercel
- **Architecture:** Domain-separated modules with shared infrastructure

### Project Structure
```
src/
├── domains/
│   ├── events/          # /events/* route group
│   │   ├── components/  # Event-specific UI components
│   │   ├── hooks/       # Event-specific hooks
│   │   ├── actions/     # Server actions
│   │   └── types/       # Event domain types
│   └── contractors/     # /contractors/* route group
│       ├── components/
│       ├── hooks/
│       ├── actions/
│       └── types/
├── shared/              # Cross-domain utilities
│   ├── components/      # Shared UI (layout, nav, etc.)
│   ├── hooks/           # Shared hooks (auth, RLS)
│   ├── types/           # Shared TypeScript types
│   └── utils/           # Helpers, constants
└── app/                 # Next.js App Router
    ├── (events)/        # Event route group
    ├── (contractors)/   # Contractor route group
    └── (dashboard)/     # Team dashboard
```

### Key Architecture Decisions
- **One codebase, two domain modules:** Events and Contractors are separate route groups sharing Supabase auth, RLS, and types. Not separate codebases — the cross-domain interactions (assign contractor to event, rate after event, template with roster) are too frequent to treat as an integration.
- **Component-based data model:** Components are flat entities. An `event_components` join table carries project-specific configuration. Same pattern for contractors: flat profile + `event_contractors` join table with assignment context.
- **Four-tier RLS:** Row Level Security policies implement the four access tiers. Organizers see everything; collaborators see assigned components; external partners see shared engagements; execution workers see their run sheets.
- **Smart links via token-scoped access:** Unauthenticated access to specific content (onboarding packets, run sheets) via signed, revocable URLs. No account required for read-only.

### Core Database Tables (Supabase/PostgreSQL)

**Event Domain:**
- `organizations` — team/company accounts
- `events` — event projects (name, dates, status, org_id)
- `components` — reusable component definitions (name, description, org_id)
- `event_components` — join: which components are in which event, with event-specific config
- `tasks` — tasks within event_components (title, assignee, status, due_date, dependencies)
- `budgets` — line items per event_component (estimated, actual, status, vendor_assignment)
- `event_templates` — saved templates cloned from past events

**Contractor Domain:**
- `contractors` — universal profile (name, contact, docs, financial, org_id)
- `contractor_tags` — user-defined specialization tags
- `contractor_tag_assignments` — many-to-many: contractors ↔ tags
- `event_contractors` — join: assignment context (role, rate, brief, status, rating)
- `vendor_slots` — per-event role slots for multi-quote pipeline
- `vendor_slot_candidates` — candidates per slot with quote data and status
- `contractor_documents` — per-engagement document checklist items with file refs
- `contractor_ratings` — post-event multi-dimensional ratings

**Access Domain:**
- `org_members` — users in org with tier (organizer, collaborator)
- `event_access` — per-event access grants (external partner, execution worker)
- `smart_links` — token-scoped shareable links with expiry and revocation

---

## 9. MVP Success Criteria

### Replaces the Tool Stack
- **Target:** >80% of event management tasks completed in-platform
- **Signal:** Users stop creating parallel spreadsheets for vendor tracking and budgets

### Enables Cost-Informed Vendor Decisions
- **Target:** Average 3+ quotes per vendor slot; >20% of selections go to non-incumbent vendor
- **Signal:** Users report feeling confident evaluating new vendors based on platform data

### Reduces Day-of Friction
- **Target:** >70% onboarding packet open rate; >50% run sheet link engagement
- **Signal:** Planners report less day-of micromanagement

### Revenue Validation
- **Target:** Identify willingness-to-pay through beta cohort; cost savings exceed subscription cost
- **Signal:** Both CCC ("budget is a concern for software") and Bonfire personas see ROI

---

## 10. Post-MVP Trajectory

| Phase | What It Adds | Trust Premium Impact | Revenue Impact |
|---|---|---|---|
| **MVP** | Event core + contractor foundation + execution + access tiers | Data collection begins; cost comparison enabled | Subscription revenue |
| **Phase 3** | Contractor accounts, threaded comms, in-platform negotiation | Contractors see reputation; competitive pricing begins | Higher retention; expanded seats |
| **Phase 4** | AI: doc extraction, smart templates, matching, forecasting | AI surfaces cheaper alternatives with data backing | Premium tier for AI features |
| **Phase 5** | Marketplace: discovery, verified reputation, network effects | Trust premium eliminated industry-wide | Take rate, premium listings, analytics |
| **Integrations** | Google Drive, Google Calendar (two-way sync), Figma, Gmail | Platform becomes organizational spine connecting all tools | Integration tier pricing |

The MVP captures data. Phases 3–5 monetize the network. The marketplace is the long-term defensible moat. Each phase produces what the next requires — nothing is throwaway.
