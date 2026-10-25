# Client Space PR 1 — Requirements tab (FO-13) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every project gets a Requirements tab where admins and the project's managers write requirements (title,
Markdown description, acceptance criteria), link tickets to them, see progress and estimated hours, mark one
confirmed (with the confirmed version kept), drop or restore it — the team side of Client Space, useful on its own.

**Architecture:**
- Requirements stay in the company data every browser has; new optional fields on `Requirement`, changed by pure
  domain commands (audit log and live refresh for free).
- Linking stays `ticket.requirementId`, set through `updateTicket` as today.
- The panel reuses the decision panel's pieces: `DocEditor` for the description, and the template checklist, pulled
  out into a reusable `ItemsEditor`.

**Tech stack:** Next.js 16 App Router, React 19, Postgres + Drizzle, node:test, Playwright.

**Spec:** `docs/specs/2026-10-25-client-space-design.md` (§6 Requirements tab, §7 requirement data, §11 PR 1).

## Global constraints

- §12 of the backend spec: additive migrations only (`ADD COLUMN IF NOT EXISTS`), commands only gain optional
  arguments, MCP tools untouched in this PR.
- Permission `requirement.edit`: admins, and managers on the project. Developers read, and link their tickets.
- Statuses this PR uses: `draft`, `confirmed`, `dropped` (the client ones come with PR 3). None = `draft`.
- Editing a confirmed requirement's title, description or criteria keeps `confirmed` and sets status `draft`.
- New ids come from the caller (`newIdError`); codes are computed in the command (same on browser and server).
- Commits as Tensorfold <tensorfold@gmail.com>, no co-author line. PR into `dev`.

---

### Task 1: Domain — data, permission, commands

**Files:**
- Modify: `src/domain/types.ts` (Requirement, RequirementStatus, RequirementVersion)
- Modify: `src/domain/permissions.ts` (`requirement.edit` in `Action`)
- Create: `src/domain/selectors/requirements.ts`
- Create: `src/domain/commands/requirements.ts`
- Test: `src/domain/commands/requirements.test.ts`

**Interfaces (produces):**
```ts
// selectors/requirements.ts
export const REQUIREMENT_STATUS: Record<RequirementStatus, { label: string; tone: Tone }>;
export const statusOfRequirement: (r: Requirement) => RequirementStatus;          // none → "draft"
export function nextRequirementCode(db: Db, productKey: string): string;          // "R" + (max n + 1)
export function requirementProgress(db: Db, r: Requirement): { linked: Ticket[]; done: number; total: number; hoursDone: number; hoursTotal: number };
// commands/requirements.ts — all check("requirement.edit", { product })
export interface RequirementInput { title: string; description?: string; criteria?: SectionItem[] }
export function addRequirement(db: Db, me: Person, productKey: string, input: RequirementInput, requirementId?: string): Db;
export function updateRequirement(db: Db, me: Person, requirementId: string, patch: Partial<RequirementInput>): Db;
export function markRequirementConfirmed(db: Db, me: Person, requirementId: string): Db;   // snapshot { rev, title, description, criteria, by, at }
export function dropRequirement(db: Db, me: Person, requirementId: string, reason: string): Db;
export function restoreRequirement(db: Db, me: Person, requirementId: string): Db;          // confirmed if confirmed.rev === rev, else draft
export function deleteRequirement(db: Db, me: Person, requirementId: string): Db;           // only never-confirmed, no linked tickets
```

- [ ] Tests first (`requirements.test.ts`, the style of `commands.test.ts`): add gives R1, R2…, trims, refuses empty
  title and a taken id; a developer is refused, a manager on the project allowed; update bumps `rev` only when
  content changes; editing a confirmed one keeps `confirmed` and turns it `draft`; mark-confirmed records who, when and
  rev; drop needs a reason; restore returns to confirmed only if unchanged since; delete refuses a confirmed one or
  one with linked tickets; `requirementProgress` counts done / total and hours, ignoring archived and cancelled
  tickets.
- [ ] Run `npm test -- --test-name-pattern requirement` (fails), implement, run again (passes).

### Task 2: Storage

**Files:**
- Modify: `src/server/db/schema.ts` (`requirements` + description, criteria jsonb, status, rev, confirmed jsonb,
  proposed_by, dropped_reason, created_at, created_by, updated_at)
- Create: `drizzle/0032_requirement_details.sql` (+ meta via `npm run db:generate`, then `IF NOT EXISTS`)
- Modify: `src/server/company/rows.ts` (both directions)
- Test: `src/server/company/rows.test.ts` (round-trip a full requirement)

- [ ] Round-trip test first, then schema, migration and rows. Apply locally with `npm run db:migrate`.

### Task 3: Wiring

**Files:** `src/domain/commands/index.ts` (registry + exports), `src/data/commands.ts` (wrapped).

- [ ] Typecheck passes; `commands` has the six new names.

### Task 4: Requirements tab and list

**Files:**
- Create: `src/app/[panel]/products/[key]/requirements/page.tsx`
- Modify: `src/features/products/ProductTabs.tsx` (Requirements after Tickets, with a count of the non-dropped)
- Create: `src/features/requirements/RequirementsView.tsx` (header, status filter, list, empty state, New button)
- Create: `src/styles/requirements.css` (imported where the other feature styles are)

- [ ] Rows: code, title, status pill, progress battery (`coverage`), "x / y done", hours, updated date. A dropped
  one is struck through and hidden behind the "Dropped" filter. Clicking a row opens the panel (`?req=<id>`).

### Task 5: Requirement panel and New dialog

**Files:**
- Create: `src/features/requirements/RequirementPanel.tsx`
- Create: `src/features/requirements/NewRequirement.tsx`
- Modify: `src/features/tickets/TemplateItems.tsx` (extract `ItemsEditor({ items, kind, editable, label, onSave })`;
  `ItemsSection` uses it)
- Modify: `src/features/products/DecisionPanel.tsx` (export `EditableText`)

- [ ] Panel: status pill with its actions (Mark confirmed · Drop with a reason · Restore · Delete), title
  (`EditableText`), description (`DocEditor`, no uploads, saved after typing stops), acceptance criteria
  (`ItemsEditor` checklist), linked tickets (open, unlink; link via `TicketPickerList` → `updateTicket(…, {
  requirementId })`), progress and hours, history (created by, confirmed by whom, which revision, when, dropped and
  why). Editing a confirmed one first asks: "It was confirmed — changing it means it needs confirming again."
- [ ] Read-only for developers (no actions, editors locked).

### Task 6: Tidy the old spots

- [ ] `DocsHome.tsx`: drop the Requirements section; delete `RequirementsTable` if nothing else uses it.
- [ ] `LiveWidgets.tsx` empty state: "No requirements yet — add them on the Requirements tab."
- [ ] `RequirementField` (ticket panel): leave out dropped requirements (keep the one already set).

### Task 7: E2E, checks, PR

- [ ] `e2e/v1.spec.ts`: a test that creates a project, adds a requirement with two criteria, links a new ticket,
  marks it confirmed, edits the title (asked first, back to Draft, confirmed version shown), drops it with a reason.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, the new e2e test plus the existing ticket ones
  (`APP_URL=http://localhost:3100`).
- [ ] PR into `dev`; CI green; merge; verify on `origin/dev`.
