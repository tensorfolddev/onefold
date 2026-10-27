# Client Space — design

Status: approved 2026-10-25 (direction, roles, access, sign-in and phases decided with the product owner; FO-13).
Revised 2026-10-26: the screens became one chat-style Client tab — see the revision below; it wins where they differ.
Builds on `2026-10-15-backend-v1-design.md` — its §12 rules hold: additive migrations, commands only gain optional
arguments, MCP tools are never renamed or removed.

## Revision — 2026-10-26: one Client tab, built like WhatsApp

After trying the first build, the product owner chose a chat design (mockups `client-room-1…4`, approved v4). It
replaces §5's client page, §6's Requirements and Clients tabs, and the hours switch:

- **One tab per project.** "Client" on a client's project with Client Space on, "Requirements" otherwise (the same
  screen, team-only). The team and the client see the same rooms (`domain/selectors/room.ts`), each with their own
  buttons.
- **Laid out like the tickets board:** no box and no header of its own. The tickets board's toolbar (Main table /
  Kanban, New, Search, Person, Quick filters for status, priority or type, whose move and needs-you/unread, and Sort),
  with three sections on its right, like monday's view tabs: **Chat** (the project's own chat, `chat:<key>`, right
  there, with Invite), **Requirements** and **Requests**. Those two show, full width, a table in status groups
  (coloured group title and bar, solid status cells, priority and build progress, or who it's for and when; a 💬
  count, blue when unread, per browser) or the tickets board's kanban (a column per status, ticket cards). A row or a
  card opens its chat (`req:<id>`, `ask:<id>`) in a panel sliding in from the right, like a ticket's; Escape, ✕ or a
  click outside closes it. (Revised 2026-10-26 from three columns, then a boxed header, which read as too busy.)
- **Cards in the chat**, one template per kind, styled like ticket cards: a requirement (priority, done-when
  checklist, build progress, confirmed stamp, Confirm / Ask for changes / Send to client / Take it on), a request
  (Access: invite + why; File: a drop zone; Question), a weekly update (health, stage, this week / next / needs).
  The card sits where it was sent; the app's own lines ("Ali confirmed it") are events in the chat.
- **Internal notes** (`kind: "note"`): anyone on the project writes them in any chat; the client never receives them,
  nor replies quoting them. Speaking to the client stays with whoever manages the project.
- **Files** in any chat, both ways (stored like doc files; a client's file in an open request answers it).
- **For the team:** a pulse line (waiting on the client / on us and for how long, scope confirmed, % built), header buttons (Remind, Create ticket, Edit, Weekly update) and per-message actions (reply,
  make it a requirement, a request or a ticket). The requirement panel (§6) is the editor, opened from its chat.
- **Removed:** the client note (the weekly update replaces it), the hours switch (clients see "2 of 3 parts done",
  never hours), the Clients tab (people live in the project chat's details). Not built yet: the "Client can see"
  switches for tickets, milestones, decisions and docs.
- **Data:** `client_messages` gains `kind`, `event`, `rev`, `data` (replyTo, file, update) and `via` (for WhatsApp
  later); `client_asks` gains `code` (Q1…) and `invite`; `orgs.client_hours` and `products.client_note` are gone.
  Every message records where it came from, so a WhatsApp bot or an AI helper can post into the same chats later.

## 1. Goal

Every client project runs on constant back-and-forth with the client: what to build, what's done, what's needed from
them, what was agreed. Today that lives in email, WhatsApp and calls, and nothing in 1Fold records it. Research
(Oct 2026, ~25 tools and agency playbooks) shows the same failures everywhere: unclear scope and "that's not what we
agreed", clients who can't see progress, slow client answers, feedback scattered across channels — and portals that
clients never log into, that leak internal notes, or that hand clients the whole team tool.

Client Space gives each client project a small, safe place for the client: **what we're building (requirements),
what we need from you, and proof of progress** — with a record of everything they confirmed. Clients act from links
in email or WhatsApp; they never learn a tool and never get a password.

Built for TensorFold's own clients first (2–3 months of use), to be sold later.

## 2. Decisions

| Question | Decision |
|---|---|
| Shape | **A separate client area inside 1Fold** (`/c/...`), sharing people, sign-in and projects with the team side, but with its **own allow-listed view** and its **own few actions**. Clients never get the team's data copy and can't run team commands. |
| Who is a client | A new kind of person, `client`. Kept in their own list (`db.clientPeople`), never in `db.people` — so no team screen, list, brief or picker can show them by accident. |
| Access | **Per project, one role per project**: Sponsor, Product owner or Tester. Admins and the project's managers add and remove them. |
| Visibility | **Private by default.** A client sees only what's built for them (requirements, their asks, the project's health and note) and what the team marks **"Client can see"** (tickets, milestones, decisions, docs). Never comments, assignees, sections, estimates (unless the hours switch is on), internal docs or other projects. |
| Tickets | Each requirement shows progress (3 of 5 done). The client sees only tickets marked "Client can see", as title + type + a plain state (Not started / In progress / Done). |
| Sign-in | **Links only, no passwords.** Invite link, then "email me a sign-in link". 30-day session per device. Notification links are plain deep links (no secret inside). |
| Hours | A company switch, **off by default**, admins only: "Show estimated hours to clients" (done vs total, from ticket estimates). Real hours and budget wait for time tracking. |
| Rollout | Everything client-facing sits behind a company switch **Client Space, off by default** (Settings → Clients). The Requirements tab is internal and always on. |
| Billing | **Never** part of Client Space (no invoices, payments, quotes). |

## 3. People and roles

**Client person** (`ClientPerson`): name, initials, colour, email, company (e.g. "2N5 Global"), active, optional
photo. Stored as a `members` row with `panel = 'client'` and a `users` row with an unusable password hash.
Loaded into `db.clientPeople`. The existing "one email, one company" rule applies (see §11 for selling).

**Project access** (`Product.clients: { personId, role }[]`, table `product_clients`). A client person can be on
several projects with a different role on each.

| Role | Phase 1 |
|---|---|
| Sponsor | Sees everything shared on the project; answers asks; confirms requirements or asks for changes; proposes requirements |
| Product owner | Same as Sponsor |
| Tester | Sees everything shared; answers asks assigned to them; writes in requirement and ask threads |

(Phase 2 separates them: Sponsor approves changes with cost; Sponsor/Product owner sign off; Tester reports bugs.)

**Managing clients:** admins, and the project's PM / project manager (manager panel), on the project's **Clients**
tab: add (name, email, company — prefilled from the project's client name — and role), change role, remove, resend
the sign-in link. Admins see all client people in People → Clients and can switch one off. Removing someone from a
project, or switching them off, revokes their sessions at once.

## 4. Sign-in

- **Invite:** adding a client person emails "<Name> invited you to <Project> on <Company>'s client space" with a
  single-use sign-in link (7 days).
- **Later:** `/c/signin` asks for an email and sends a single-use link (30 minutes). It always answers the same way,
  whether or not the email is a client (no account probing), and is rate-limited.
- **The link page** (`/c/link/<token>`) shows the company and a **Continue** button that POSTs the token — so email
  scanners that pre-open links can't use it up. On success: a session of kind `client`, 30 days, then the page they
  were going to (only `/c/...` paths).
- **Tokens:** the existing `email_tokens` table, purpose `signin`; only the hash is stored.
- **Sessions:** `sessions.kind` = `team` | `client`. Client sessions are refused unless the person is an active
  client and the company's Client Space is on.
- **Password sign-in refuses client people.** (There is no Google sign-in; Google is only the Drive backup.)
- `proxy.ts` sends client sessions to `/c`; a client opening a team URL lands on `/c`.

## 5. What the client sees

`/c` lists their projects (straight to the project if there's one). `/c/<key>` is one page, phone-first:

1. **Header:** project name and icon, the agency's name, **health** (On track / Needs attention / At risk, from
   `good` / `watch` / `risk`), the team's **client note** (one line, with its date), stage in plain words, and
   **your contacts** (the PM and project manager: name, photo).
2. **Needs from you:** open asks for them (or for anyone on the client side) and requirements waiting for their
   confirmation, oldest due first.
3. **Requirements:** code, title, status, progress bar (done / total linked tickets), hours if the switch is on.
   Opening one shows its description, acceptance criteria, linked tickets the client can see, who confirmed which
   version and when, and its **thread**.
4. **Progress:** tickets marked "Client can see" — in progress now, and done in the last 14 days.
5. **Milestones** marked "Client can see": name, due date, % done, days late.
6. **Decisions** marked "Client can see": title, status, date, why (or body).
7. **Documents** marked "Client can see": read-only, with their images.

**Client actions** (each checked against role and project):

| Action | Who |
|---|---|
| Confirm a requirement (records person, time and revision) | Sponsor, Product owner |
| Ask for changes on a requirement (with a message) | Sponsor, Product owner |
| Propose a new requirement (title + details) | Sponsor, Product owner |
| Answer an ask (a message in its thread, which may hold a link; the ask becomes `answered`) / mark it done | The assignee; if unassigned, a Sponsor or Product owner |
| Write in a requirement's or ask's thread | Any client on the project |

Every action notifies the project's PM and project manager (and an ask's creator) in their 1Fold inbox
(notification kind `client`).

## 6. Team side

**Requirements tab (FO-13)** on every project (internal; works without Client Space):
- List, in code order: code (R1, R2… auto), title, status, progress (linked tickets done / total), estimated hours,
  last change; filter by status; New requirement.
- Requirement panel: title, description (Markdown), acceptance criteria (checklist), linked tickets (link / unlink —
  sets `ticket.requirementId`, which already exists), the client thread, and history (proposed by, confirmed by whom,
  which revision, when).
- Status actions: Send to client for confirmation · Mark confirmed (confirmed outside 1Fold — records who and when) ·
  Accept a client's proposal · Drop (with a reason, kept and struck through) · Restore.
- Editing a confirmed requirement's title, description or criteria warns first, keeps the confirmed version, and
  sets status back to draft; the client keeps seeing the confirmed version (marked "Being updated") until it's sent
  again.
- The requirements table moves here from the bottom of the Docs page.

**Requirement statuses:** `draft` (team only) · `proposed` (by the client) · `to_confirm` · `changes_requested` ·
`confirmed` · `dropped`. The client sees every requirement except a `draft` that was never confirmed; a `draft` with
a confirmed version shows that version.

**Clients tab** (client projects, Client Space on; admins and the project's managers): client people and roles,
add / change / remove / resend, the **client note** and health, **asks** (Needs from you), and **View as client**
(the client page exactly as a chosen role sees it, read-only).

**Asks ("Needs from you"):** title, details, kind (question · access · file · other), optional due date, optional
assignee (one client person; none = anyone on the client side). States: `open` → `answered` (client replied) →
`done`, or `cancelled`. Team and client write in its thread; the team closes it. Files: a link for now (uploads come
with Phase 3).

**"Client can see"** switches (shown only when Client Space is on): ticket panel, milestone form, decision panel, and
a project doc's header. An eye badge marks shared items everywhere on the team side.

**Settings → Clients** (admins): Client Space on/off · Show estimated hours to clients.

**Who does what on the team:** admins and the project's managers (`requirement.edit`, `client.manage`) edit
requirements, send them, manage client people and asks, set the note, and reply in client threads — one controlled
voice to the client. Developers on the project see requirements, asks and threads read-only, and link their tickets
to requirements (`ticket.requirementId`, as today); they don't see the Clients tab's people management.

## 7. Data

Types (`src/domain/types.ts`):

```ts
type ClientRole = "sponsor" | "owner" | "tester";
interface ClientPerson { id: string; name: string; initials: string; color: string; email: string; company: string; active: boolean; photo?: string }
interface ProductClient { personId: string; role: ClientRole }                 // Product.clients?: ProductClient[]
type RequirementStatus = "draft" | "proposed" | "to_confirm" | "changes_requested" | "confirmed" | "dropped";
interface RequirementVersion { rev: number; title: string; description: string; criteria: SectionItem[]; by: string; at: string }
interface Requirement {                                                         // existing fields kept
  id: string; productKey: string; code: string; title: string;
  description?: string; criteria?: SectionItem[]; status?: RequirementStatus;   // none = "draft"
  rev?: number; confirmed?: RequirementVersion; proposedBy?: string; droppedReason?: string;
  createdAt?: string; createdBy?: string; updatedAt?: string;
}
type AskKind = "question" | "access" | "file" | "other";
type AskState = "open" | "answered" | "done" | "cancelled";
interface Ask { id: string; productKey: string; title: string; details: string; kind: AskKind; assigneeId?: string;
  due?: string; state: AskState; createdBy: string; createdAt: string; answeredBy?: string; answeredAt?: string; closedAt?: string }
interface ClientMessage { id: string; productKey: string; subject: string; authorId: string; at: string; body: string } // subject "req:<id>" | "ask:<id>"
// Ticket, Milestone, Decision, Doc gain clientVisible?: boolean. Product gains clientNote?, clientNoteAt?.
// Org gains clientSpace?: boolean, clientHours?: boolean.
```

`Db` gains `clientPeople`, `asks`, `clientMessages`.

Tables and columns (migrations 0032+, all additive):
- `sessions.kind` text not null default `'team'`.
- `members.client_company` text.
- `product_clients` (org_id, id = "<product>:<member>", product_id, member_id, role, position).
- `requirements` + description, criteria jsonb, status, rev, confirmed jsonb, proposed_by, dropped_reason,
  created_at, created_by, updated_at.
- `client_asks`, `client_messages` (company tables like the others).
- `tickets`, `milestones`, `decisions`, `docs` + `client_visible` boolean not null default false.
- `products` + client_note, client_note_at. `orgs` + client_space, client_hours (boolean not null default false).
- New tables join `BACKED_UP` (the backup test enforces it).

The team snapshot (`snapshotFor`) carries `clientPeople` on the person's projects (emails for admins and that
project's managers only), and `asks` / `clientMessages` within project scope.

## 8. Server

- **`clientViewFor(db, clientPersonId)`** (pure, `src/domain/clientView.ts`) builds a `ClientView` — a new shape, not
  a `Db` — field by field from §5. Anything not copied in explicitly can't reach a client.
- **Routes** (`/api/client/...`): `view` (GET), `act` (POST `{action, args}`), `events` (SSE: version numbers only),
  `signin` (POST token), `link` (POST email), `docs/<id>` (a shared doc's body), `files/<id>` (images in shared docs,
  and photos of the people shown). All use `requireClientSession`.
- **`requireSession` refuses client sessions** — every existing team route, the MCP token routes and file and doc
  routes are closed to clients in one place.
- **Client actions** are domain commands in their own registry (`src/domain/commands/client.ts`,
  `(db, me: ClientPerson, …args) => Db`), run in the same transaction, save, journal (source `client`) and live
  refresh path as team changes. The team registry can't run them, and the client route can't run team commands.
- **Team commands** (team registry): requirements (add, update, send, markConfirmed, acceptProposal, drop, restore,
  reorder), asks (create, update, close, cancel, reopen), `postClientMessage`, `setProductClient` (role or remove),
  `setClientNote`, `setClientSettings` (admin), `clientVisible` via the existing update commands. Inviting a client
  is server-only (it makes the secret link), like `inviteMembers`.
- **Emails** (Resend; the existing templates' style): client invite, sign-in link, new ask, requirement to confirm,
  team reply in a thread the client started or is assigned to. **WhatsApp:** the same messages from the company's
  own number when the client has linked WhatsApp (the existing link-code flow). Nothing else is sent — no digests in
  Phase 1.
- **View as client:** `GET /api/client/preview?product=<key>&role=<role>` (team session with access to the project)
  returns `clientViewFor` for a stand-in client with that role; actions are disabled.

## 9. Safety rules (each has a test)

1. A client session gets 403 from every team route (`/api/org`, `/api/docs`, `/api/files`, `/api/tokens`,
   `/api/whatsapp`, `/api/drive`, `/api/email`, `/api/mcp`).
2. A team session gets 403 from client action routes (except `preview`).
3. `clientViewFor` never contains: a ticket, milestone, decision or doc not marked visible; any comment, activity,
   section, assignee, estimate (switch off), team email, other project, or other client's ask.
4. A client can't act on a project they're not on, or beyond their role.
5. Client Space off → client sign-in refused and existing client sessions refused.
6. Removing or switching off a client revokes their sessions.
7. Password sign-in refuses client people; a client can't create API tokens.
8. A sign-in link works once, expires, and only redirects to `/c/...`.

## 10. Testing

Unit (node:test): client commands and permissions; `clientViewFor` leak tests (seeded data full of internal strings,
asserting none appear in `JSON.stringify(view)`); requirement status and version rules; rows round-trip; backup
coverage. E2E (Playwright, `e2e/client.spec.ts`): turn Client Space on → invite a client → open the emailed link
(`EMAIL_OUTBOX_DIR`) → see the project → confirm a requirement and answer an ask → the team sees both; a ticket marked
"Client can see" appears and one not marked doesn't; a client session is refused by a team API.

## 11. Delivery

Phase 1 ships as four PRs into `dev`, each green on its own, all client-facing parts behind Client Space (off):

1. **Requirements tab** (FO-13, team side only) + this spec.
2. **Client people and sign-in:** Settings → Clients, Clients tab (people and roles), links and sessions, the guards
   of §9, the `/c` shell with the project header, View as client.
3. **Client requirements and asks:** the client side of §5.2–3, threads, emails and WhatsApp, team notifications.
4. **Shared items and hours:** "Client can see" switches, §5.4–7, client doc reading and images, the hours switch.

Then: local test → staging (turned back on for it) → production after approval.

**Later phases** (own specs): **Phase 2** — change requests with impact and one-tap approval, formal sign-off of
milestones and UAT, a weekly client update drafted by AI and approved by the PM. **Phase 3** — client bug reports
with screenshots or voice notes, WhatsApp replies landing in threads, an assistant that answers "where's my
feature?" from what the client can see.

**Before selling:** one email in several companies (a client of two agencies), SSO for enterprise clients, the
agency's own domain and branding.

## 12. After the first client test (2026-10-27)

What changed once a client had used it:

- **The tab opens on Chat.** Requirements and Requests list every phase, even empty ones. Only the section scrolls;
  the page never does (measured like the tickets board).
- **Each project's own words.** In a project's Settings → Client tab, whoever shapes its board (`statuses.edit`, as
  for its ticket priorities) renames and recolours any phase (`products.client_phases`) and edits the requirement
  priorities: rename, recolour, reorder, add up to 8 (`products.requirement_priorities`). Both sides see the names.
  A priority still on one of its requirements can't be removed. A priority changes in place from the table or a card,
  without opening the chat.
- **A chat like WhatsApp.**
  - Messages render Markdown.
  - `@name`, `@Team` and `@everyone` tell the team on the project, `@@` urgently (the send button turns red). A client's
    mention reaches the team too; no other message makes a notification, only a tone ("Chat messages" in
    Notifications & sounds).
  - Delete for everyone (the author only) or for me. Stars are private; pins are for everyone, at most 3.
  - Read marks live on the server (`chat_reads`), so unread counts follow a person between devices. The ticks turn
    blue once the other side has read a line.
  - Every line is its own row, so many people can write at once.
- **The client's own link.** Each client person has one short, permanent link, `/c/l/<12 characters>`, in
  `client_links`: hashed to look up, sealed to show the team again, never in backups.
  - It signs them in until an admin makes a new one (Settings → Clients). The old one then stops working, and the
    new one is emailed.
  - Switching them off or turning Client Space off still shuts them out.
  - The emailed one-time links (`/c/link/…`, from "Email me a link") stay as they were.
- **Invite** is a centred dialog with a **Guide**: every phase, in the company's own words, and who does what.
- **Weekly update:** fixed boxes that scroll, up to 2,000 characters each, Markdown, and "Draft from this week"
  (what was confirmed, finished, in progress and still owed). The team words it before it goes.
- **Developers** do everything in the Client tab except admin things and the client's people (`client.people`:
  managers and admins).
- **MCP:** tools to list, create and update requirements and requests, and to send a requirement to the client.
  They never return chat content, invites, or client emails and links.
