# Docs — design

Status: approved 2026-10-18 (scope, approach and permissions decided with the product owner). Builds on
`2026-10-15-backend-v1-design.md`, and its §12 rules hold throughout: additive migrations, commands only gain
optional arguments, and MCP tools are never renamed or removed.

## 1. Goal

Today a "doc" is a title and a kind, with no body. Replace that with a writing space people want to use: a
Notion-style editor where Markdown shortcuts turn into blocks as you type, beautiful reading pages, nested pages, live
updates, @mentions, live links to tickets and docs, link previews, comments, version history, images and files, and
MCP tools so Claude can read and write docs like a teammate.

## 2. Decisions

| Question | Decision |
|---|---|
| Where docs live | Two kinds of space: **each project** (its Docs tab) and **the company** (a new Docs entry in the left rail). Pages nest under pages. |
| Two people, one doc | **Autosave + live refresh.** Saved changes appear live for everyone. While someone edits, others see "Hina is editing". A save never silently overwrites a newer one (§6). No real-time co-typing. |
| Editor | **TipTap 3** (ProseMirror), with 1FOLD's own slash menu, toolbar and handles. |
| Storage format | **Markdown is the source of truth**, readable by people, Claude and git. Rich bits use standard or link-shaped Markdown (§5). |
| Permissions | **Everyone who can see a space creates, edits and comments.** **Only admins archive, restore and delete.** Deleting is permanent, happens only from Archived, and needs "Delete <title>" typed. |
| Scope | Everything, delivered in three phases (§11), each shipped as its own PR. |

## 3. Who sees what

- **Project docs:** visible to the people on that project (PM, project manager, members) and to admins, the same rule
  as opening the project (`mayOpen`). Archived projects' docs are read-only.
- **Company docs:** visible to every active person in the company.
- **Permissions in `can()`:** `doc.create`, `doc.edit` and `doc.comment` are granted to anyone who can see the
  space. `doc.archive` and `doc.delete` are admin only.
- The legacy permissions `doc.add`, `doc.addMeetingNotes` and `doc.delete` stay, for old screens. `doc.delete` becomes
  admin only.
- **MCP** uses the same rules: tools act as the token's person.

## 4. Data

Doc metadata lives in the company data that every browser already has, so the page tree, titles and permissions are
instant and live. Bodies, versions and the link index live in their own tables. A browser loads a doc's body only
when it opens that doc.

`Doc` gains optional fields, so old rows keep working:

```ts
interface Doc {
  id: string;
  productKey: string;        // "" = the company space, stored as NULL (product_id made nullable: allowed, nothing lost)
  parentId?: string;         // nesting; undefined = top level of its space
  title: string;
  icon?: string;             // one emoji
  cover?: string;            // a gradient id from a fixed palette (no uploads for covers)
  kind: DocKind;             // legacy tag; new docs keep the template's kind or "Brief"
  template?: string;         // which template it started from
  authorId: string;
  createdAt?: string;        // ISO
  updated: string;           // legacy day, still written
  updatedAt?: string;        // ISO; "edited 2 min ago"
  updatedBy?: string;
  rev?: number;              // body revision, mirrors doc_bodies.rev (throttled, §6)
  archivedAt?: string; archivedBy?: string;
}
```

New tables. All are keyed by `org_id`, indexed on every foreign key, and added by migration only.

- `doc_bodies(org_id, doc_id, body text, rev int, updated_at, updated_by)`: one row per doc. It also has a
  `tsvector` column (title + body) with a GIN index, for search.
- `doc_versions(org_id, id, doc_id, rev, title, body, author_id, at)`: snapshots. They're written from phase 1 on, and
  the UI to browse them arrives in phase 3.
- `doc_links(org_id, doc_id, kind 'doc'|'ticket'|'person', target)`: rebuilt from the body on every save. Used for
  backlinks and for detecting new mentions (phase 2).
- `link_previews(url_hash, url, data jsonb, fetched_at)`: a global cache of web link previews (phase 2).
- **Phase 3, in company data like ticket comments and attachments:**
  - `DocComment {id, docId, parentId?, authorId, body, quote?, at, editedAt?, resolvedAt?, resolvedBy?}`
  - `DocAttachment {id, docId, name, type, size, by, at}`

Legacy docs (a title and a kind, no body) become pages with an empty body. Nothing is lost.

## 5. The editor and its Markdown

The editor is one TipTap instance, editable or read-only. It is loaded with `import()` only on doc pages, so other
pages don't pay for it. Each block below must survive a Markdown round trip exactly, and unit tests prove it:

| Block | Markdown |
|---|---|
| Headings 1–3, paragraphs, bold, italic, ~~strike~~, `code`, highlight `==x==` | CommonMark/GFM |
| Bullet, numbered, task lists `- [ ]` (nestable) | GFM |
| Quote, divider `---`, code block with language (syntax-highlighted with lowlight) | CommonMark |
| Callout | GitHub alerts: `> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]` |
| Table | GFM table |
| Link | `[text](https://…)`, opens in a new tab with `rel="noopener noreferrer"` |
| Link preview card (phase 2) | a paragraph holding only `<https://…>` |
| Mention (phase 2) | `[@Hina Raza](mention:<personId>)` |
| Ticket / doc chip (phase 2) | `[EN-12](ticket:EN-12)`, `[Design spec](doc:<docId>)` |
| Image / file (phase 3) | `![alt](/api/files/<id>)`, `[report.pdf](/api/files/<id>)` |

**Typing:**
- `/` opens a block menu, searchable and keyboard-driven.
- Markdown shortcuts work: `#`, `##`, `-`, `1.`, `[]`, `>`, ```` ``` ````, `---`, `**`, `_` and `` ` ``.
- Pasting Markdown or HTML converts it to blocks.
- Selecting text shows a floating toolbar: bold, italic, strike, code, highlight, link, and comment in phase 3.
- Every block has a hover handle `⋮⋮` to drag it, or to turn it into another block, duplicate or delete it.

**Safety:**
- Markdown is parsed into editor nodes and never inserted as raw HTML.
- Raw HTML in a body is shown as text.
- Link targets are limited to `http:`, `https:`, `mailto:` and the app's own schemes (`mention:`, `ticket:`, `doc:`).
- `/api/files/` paths are allowed. `javascript:` and other schemes are dropped.
- **Spike first:** TipTap's official `@tiptap/markdown` must round-trip every row above, including the custom nodes.
  The first task of phase 1 proves this. If any row fails, that node gets its own parse/serialize rules, and the
  storage format stays the same.

## 6. Saving, live updates and conflicts

- **Open:** `GET /api/docs/:id` returns `{doc, body, rev, presence}`. Phase 2 adds `backlinks`.
- **Autosave:** the client saves `PUT /api/docs/:id {body, baseRev}`. It saves 800 ms after typing stops, and at
  least every 5 s while typing.
  - The server checks visibility and `doc.edit`, then compares `baseRev` with the stored rev under a row lock.
  - If they match, it stores the body, `rev+1`, the time and the author, and returns the new rev.
  - If they differ, it returns **409** with the latest `{body, rev, updatedBy, updatedAt}`.
- **On a 409** the editor shows: "Hina saved a newer version while you were typing." There are two choices:
  - **Use theirs:** your text is put on the clipboard, then their version loads.
  - **Keep mine:** saves your text on top. Their version is snapshotted to `doc_versions` first, so nothing is lost.
- **Live updates:**
  - A body save sends `pg_notify` with `orgId:doc:<docId>:<rev>:<personId>`. The SSE stream (`/api/org/events`)
    forwards it as `event: doc`.
  - An open viewer that isn't typing reloads the body quietly.
  - Someone mid-edit sees "Updated by Hina — reload" instead, so it never jumps under the cursor.
- **Metadata:** title, icon, moves and archive go through domain commands, so they get the normal version bump, live
  refresh and audit log.
  - Body saves bump the doc's `updatedAt/updatedBy/rev` in company data at most once per 2 minutes per doc, and once
    when the editor closes.
  - That way, a long typing session doesn't make every browser in the company refetch its whole view.
- **Presence:**
  - While a doc is open, the client posts `POST /api/docs/:id/presence {editing}` every 15 s.
  - The server keeps a short in-memory map. `ponytail:` it's one map per process; move it to the database or Redis
    when there's more than one app server.
  - Changes are sent as `event: presence`. The header shows viewers' avatars, and "Hina is editing" when it applies.
- **Versions (written from phase 1):**
  - A save by the same author within 10 minutes of their last version updates that version. Otherwise it adds a new
    one.
  - "Keep mine" and restores always snapshot first.

## 7. Screens and look

**Direction:** editorial and calm, Notion's ease with Linear's precision. The writing column is about 720 px wide.

**The page:**
- An optional gradient cover band and a large emoji icon above a 40 px title.
- Generous line height (1.7) and a clear heading scale.
- A muted "Edited 2 min ago by Hina · 4 min read" line under the title.
- A sticky contents rail on wide screens.
- Pages are readable and tappable on phones. Reduced motion is respected.
- It uses the app's existing font and colour tokens, with no new font family.

**Where docs appear:**
- **Company:** a new **Docs** entry in the left rail.
  - `/{panel}/docs` is a landing page with recently edited docs, "Created by me", and templates.
  - A side tree shows the company space.
  - `/{panel}/docs/{id}` opens a doc.
- **Project:** the **Docs** tab becomes the same layout, with the project's tree on the left.
  - The landing view keeps the Requirements table.
  - `/{panel}/products/{key}/docs/{id}` opens a doc.
- **Short links:** `/{panel}/d/{id}` redirects to whichever of these applies. MCP and links use it.

**Using the tree:**
- Each page has ⋯ for new subpage, rename, change icon, move, copy link, export `.md`, and (admins only) Archive.
- Dragging nests or reorders pages.

**Other screens:**
- **New doc:** a template picker with Blank, Brief, Requirements, Design, Architecture decision, Meeting notes,
  Postmortem and Weekly update. The company space adds Handbook page and Onboarding.
- **Archived:** under Settings → Archived for each project and for the company. Admins can restore with one click,
  or delete for good by typing "Delete <title>".
- **Archiving rules:** archiving a page archives its subpages with it. Restoring brings that subtree back together.
- **Search:** a box in the docs sidebar searches titles and bodies with Postgres full text. Phase 2 adds docs to the
  header search.
- **Import and export:** drop a `.md` file to import it. Export or copy any doc as Markdown.

## 8. Connected docs (phase 2)

- **@mentions:**
  - `@` opens a people picker, limited to people who can see the doc.
  - On save, the server compares the doc's `mention:` links with the previous `doc_links`. Newly mentioned people
    get a `mention` notification ("Ayla mentioned you in Design spec", target `/docs/<id>`) in one company change.
  - Mentions removed and added again within a session don't notify twice.
- **Ticket and doc chips:**
  - Typing a ticket key like `EN-12` then a space, or `[[` (which opens a ticket and doc picker), inserts a live chip.
  - Pasting an app URL (`/t/EN-12`, `/d/<id>`) does the same.
  - A chip renders from live company data: the key, title, status colour and assignee avatar, or the doc's icon and
    title. Clicking opens it.
  - A target the viewer can't see renders as plain text.
- **Backlinks:**
  - A doc's footer lists "Linked from": the visible docs whose `doc_links` point here, plus tickets whose sections
    link here (checked in the browser).
  - The ticket panel gains "Mentioned in docs".
- **Link previews:**
  - Pasting a URL on its own line offers "Preview card" or "Link".
  - The card shows the site icon, title, description and image, fetched by `GET /api/docs/unfurl?url=`.
  - The fetch is http(s) only. Every DNS answer is checked, and private, loopback and link-local addresses are
    refused, including after each of at most 3 redirects. Limits: 5 s timeout, 1 MB, HTML only.
  - Results are cached for 7 days, and the endpoint is rate-limited per person.
  - Card images load with `referrerpolicy="no-referrer"`.
  - YouTube, Figma and GitHub get the same card, with no iframes.
- **Plain links:** `Cmd+K` or the toolbar opens a small link editor. Links open in a new tab.

## 9. Collaboration (phase 3)

- **Comments:**
  - Comment on the doc as a whole, or select text and comment on that passage.
  - A passage comment stores the quoted text. The highlight finds it again by text, so the Markdown stays clean.
    If the text is gone, the comment says so.
  - Comments live in a right sidebar, as threads with replies.
  - People can resolve and reopen threads, edit their own comments, and delete their own (admins can delete any).
  - @mentions in comments notify the same way.
- **Version history:**
  - A drawer lists versions with author, time and size change.
  - Opening one shows it rendered, with a word-level diff against the current version, using the `diff` package.
  - **Restore** makes it the new current version, and nothing is lost.
- **Images and files:**
  - Paste, drop, or use `/image` and `/file`.
  - Uploads go through `POST /api/files` with a `docId`. The server checks what a file is from its bytes.
    - **Images** (PNG, JPEG, WebP or GIF, up to 10 MB) show inline, resizable, with captions.
    - **Files** (PDF, TXT, CSV, MD, JSON, ZIP, DOCX, XLSX or PPTX, up to 25 MB) are download chips, served with
      `Content-Disposition: attachment` and `nosniff`.
  - Reading a file checks the viewer may see a doc or ticket that uses it.
  - Unused files are cleaned up later, the same as ticket images.

## 10. MCP tools (additive)

| Tool | What it does | Phase |
|---|---|---|
| `list_docs` | The doc tree of a space (a project key or name, or `"company"`). An option includes archived docs (admins). | 1 |
| `search_docs` | Full-text search across the docs you can see. | 1 |
| `get_doc` | A doc by id, link or title: metadata plus Markdown body. Phase 2 adds backlinks. | 1 |
| `create_doc` | A title, space, optional parent, template and Markdown body. Returns the id and link. | 1 |
| `update_doc` | Title, icon, and body: replace it, or `append` Markdown. Uses the same conflict check, with an optional `base_rev`. | 1 |
| `move_doc` | Change the parent, space or position. | 1 |
| `archive_doc` / `restore_doc` | Admin only, enforced as on the web. **No delete tool.** | 1 |
| `list_doc_comments` / `add_doc_comment` | Read threads, comment and reply. Mentions use `@Name` or `@email`. | 3 |
| `list_doc_versions` / `restore_doc_version` | Version history. | 3 |

Mentions in Markdown sent by MCP can be written `[@Hina](mention:hina@acme.com)`. The server turns a name or email
into the person's id.

## 11. Phases

1. **Docs core:** the data and migrations, commands, permissions, body API with conflicts, live doc and presence
   events, company Docs and the project Docs tab (tree, editor, landing), templates, search, archive and delete
   (admin), Markdown import and export, and the phase 1 MCP tools.
2. **Connected docs:** mentions with notifications, ticket and doc chips, backlinks, link previews (unfurl),
   plain-link editing, and docs in the header search.
3. **Collaboration:** comments and replies, the version history UI with diff and restore, images and files, and the
   phase 3 MCP tools.

Each phase is one PR into `dev`, merged once CI is green. Releases to staging follow the usual dev→stg flow.

## 12. Testing

- **Markdown round trip:** a table-driven test, with every row of §5 parsed and serialized back unchanged.
- **Domain:** commands and permissions. Everyone creates and edits, only admins archive and delete, archiving
  cascades to subpages, and project docs are hidden from people who aren't on the project.
- **Server:**
  - Bodies: visibility, the 409 on a stale `baseRev`, version coalescing, and throttled metadata bumps.
  - Search filtered by visibility.
  - Unfurl guard: private addresses, redirects and size limits.
  - Mention diffing.
- **MCP:** each tool, including its refusals, in `mcp.test.ts`.
- **e2e:**
  - Create from a template, type Markdown shortcuts, reload and see it saved.
  - A second browser sees the change live, along with the editing banner.
  - Archive, restore and delete are admin only, and need the name typed.
  - Phase 2: a mention notifies, and a ticket chip opens the ticket.
  - Phase 3: a comment thread resolves, a version restores, and an image upload survives a reload.
