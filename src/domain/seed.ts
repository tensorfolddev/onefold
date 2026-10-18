// Test fixture only: a sample company the automated tests run against (see data/demo.ts). It is never shown in the
// product, nor loaded into staging or production — every real company starts empty at sign-up.
import type {
  Activity, Comment, Decision, Doc, Milestone, Notification, Org, Person, Product,
  ProductGroup, Requirement, StageRequest, Status, Team, Ticket,
} from "./types.ts";

/** The day the demo data was written against. */
export const SEED_TODAY = "2026-10-01";

export const org: Org = {
  id: "org-tensorfold", slug: "tensorfold", name: "TensorFold", emailDomain: "tensorfold.example", domainLock: true,
  createdAt: "2026-01-05", createdBy: "u-omar",
};

export const productGroups: ProductGroup[] = [
  { id: "grp-client", name: "Client products" },
  { id: "grp-internal", name: "Internal products" },
];

export const jobTitles: string[] = ["CEO", "CTO", "Product Manager", "Project Manager", "Team Lead", "Engineer", "Designer", "QA Engineer", "Client"];

export const people: Person[] = [
  { id: "u-omar", name: "Omar Siddiqui", initials: "OS", color: "var(--color-dark_indigo)", role: "CEO", team: "leadership", capacityH: 20, email: "omar@tensorfold.example", active: true, panel: "admin" },
  { id: "u-tayyab", name: "Muhammad Tayyab", initials: "MT", color: "var(--color-sofia_pink)", role: "CTO", team: "leadership", capacityH: 30, email: "tayyab@tensorfold.example", active: true, panel: "admin" },
  { id: "u-hina", name: "Hina Raza", initials: "HR", color: "var(--color-purple)", role: "Product Manager", team: "leadership", capacityH: 40, email: "hina@tensorfold.example", active: true, panel: "manager" },
  { id: "u-bilal", name: "Bilal Khan", initials: "BK", color: "var(--color-river)", role: "Project Manager", team: "leadership", capacityH: 40, email: "bilal@tensorfold.example", active: true, panel: "manager" },
  { id: "u-ayesha", name: "Ayesha Malik", initials: "AM", color: "var(--color-grass_green)", role: "Team Lead", team: "frontend", capacityH: 32, email: "ayesha@tensorfold.example", active: true, panel: "manager" },
  { id: "u-sara", name: "Sara Ahmed", initials: "SA", color: "var(--color-bright-blue)", role: "Engineer", team: "frontend", capacityH: 40, email: "sara@tensorfold.example", active: true, panel: "developer" },
  { id: "u-daniyal", name: "Daniyal Shah", initials: "DS", color: "var(--color-dark-orange)", role: "Engineer", team: "frontend", capacityH: 40, email: "daniyal@tensorfold.example", active: true, panel: "developer" },
  { id: "u-usman", name: "Usman Ali", initials: "UA", color: "var(--color-teal)", role: "Team Lead", team: "backend", capacityH: 32, email: "usman@tensorfold.example", active: true, panel: "manager" },
  { id: "u-zain", name: "Zain Haider", initials: "ZH", color: "var(--color-navy)", role: "Engineer", team: "backend", capacityH: 40, email: "zain@tensorfold.example", active: true, panel: "developer" },
  { id: "u-maryam", name: "Maryam Iqbal", initials: "MI", color: "var(--color-berry)", role: "Team Lead", team: "ai", capacityH: 32, email: "maryam@tensorfold.example", active: true, panel: "manager" },
  { id: "u-faraz", name: "Faraz Qureshi", initials: "FQ", color: "var(--color-winter)", role: "Engineer", team: "ai", capacityH: 40, email: "faraz@tensorfold.example", active: true, panel: "developer" },
  { id: "u-client-acme", name: "Laura Chen (Acme)", initials: "LC", color: "var(--color-steel)", role: "Client", team: "leadership", capacityH: 0, email: "laura@acme.com", active: true },
];

export const teams: Team[] = [
  { id: "frontend", name: "Frontend", leadId: "u-ayesha" },
  { id: "backend", name: "Backend", leadId: "u-usman" },
  { id: "ai", name: "AI", leadId: "u-maryam" },
];

export const products: Product[] = [
  {
    key: "AP", groupId: "grp-client", createdAt: "2026-08-04", memberIds: ["u-ayesha", "u-sara", "u-daniyal", "u-usman", "u-zain"], name: "Acme Portal", type: "client", client: "Acme Inc.", stage: "BUILD", health: "risk",
    pmId: "u-hina", projectManagerId: "u-bilal", color: "var(--color-bright-blue)",
    description: "Customer self-service portal for Acme Inc.: login, account management and report exports.",
  },
  {
    key: "OF", groupId: "grp-internal", createdAt: "2026-09-01", memberIds: ["u-ayesha", "u-sara", "u-zain"], name: "1Fold", type: "internal", stage: "BUILD", health: "good",
    pmId: "u-hina", projectManagerId: "u-bilal", color: "var(--color-grass_green)",
    description: "Our own product & ticket management system — replaces Jira for TensorFold.",
  },
  {
    key: "NV", groupId: "grp-client", createdAt: "2026-09-10", memberIds: ["u-maryam", "u-faraz"], name: "Nova ML API", type: "client", client: "Nova Health", stage: "DEFINE", health: "good",
    pmId: "u-hina", projectManagerId: "u-bilal", color: "var(--color-purple)",
    description: "Hosted inference API for Nova Health's triage model.",
  },
  {
    key: "OR", groupId: "grp-internal", createdAt: "2026-09-24", memberIds: [], name: "Orbit", type: "internal", stage: "INTAKE", health: "watch",
    pmId: "u-hina", projectManagerId: "u-bilal", color: "var(--color-dark-orange)",
    description: "Internal analytics dashboard for sales pipeline.", waitingApproval: "approve intake?",
  },
];

/** Each product sets its own statuses; each maps to one of five fixed categories. */
export const statusesByProduct: Record<string, Status[]> = {
  AP: [
    { id: "ap-epic", name: "Epic", category: "backlog", tone: "stuck", system: "epic" },
    { id: "ap-backlog", name: "Backlog", category: "backlog", tone: "backlog", system: "backlog" },
    { id: "ap-ready", name: "Ready", category: "todo", tone: "todo" },
    { id: "ap-dev", name: "In Dev", category: "in_progress", tone: "working" },
    { id: "ap-review", name: "Review", category: "in_progress", tone: "review" },
    { id: "ap-qa", name: "QA", category: "in_progress", tone: "working" },
    { id: "ap-blocked", name: "Blocked", category: "in_progress", tone: "stuck" },
    { id: "ap-shipped", name: "Shipped", category: "done", tone: "done" },
    { id: "ap-wontdo", name: "Won't Do", category: "cancelled", tone: "cancelled" },
  ],
  OF: [
    { id: "of-epic", name: "Epic", category: "backlog", tone: "stuck", system: "epic" },
    { id: "of-backlog", name: "Backlog", category: "backlog", tone: "backlog", system: "backlog" },
    { id: "of-todo", name: "To Do", category: "todo", tone: "todo" },
    { id: "of-progress", name: "In Progress", category: "in_progress", tone: "working" },
    { id: "of-review", name: "Code Review", category: "in_progress", tone: "review" },
    { id: "of-stuck", name: "Stuck", category: "in_progress", tone: "stuck" },
    { id: "of-done", name: "Done", category: "done", tone: "done" },
    { id: "of-cancelled", name: "Cancelled", category: "cancelled", tone: "cancelled" },
  ],
  NV: [
    { id: "nv-epic", name: "Epic", category: "backlog", tone: "stuck", system: "epic" },
    { id: "nv-backlog", name: "Backlog", category: "backlog", tone: "backlog", system: "backlog" },
    { id: "nv-todo", name: "To Do", category: "todo", tone: "todo" },
    { id: "nv-progress", name: "Working on it", category: "in_progress", tone: "working" },
    { id: "nv-done", name: "Done", category: "done", tone: "done" },
  ],
  OR: [
    { id: "or-epic", name: "Epic", category: "backlog", tone: "stuck", system: "epic" },
    { id: "or-backlog", name: "Backlog", category: "backlog", tone: "backlog", system: "backlog" },
    { id: "or-done", name: "Done", category: "done", tone: "done" },
  ],
};

export const requirements: Requirement[] = [
  { id: "AP-R1", productKey: "AP", code: "R1", title: "Users can log in with email" },
  { id: "AP-R2", productKey: "AP", code: "R2", title: "Users can reset password" },
  { id: "AP-R3", productKey: "AP", code: "R3", title: "Admin can export reports" },
  { id: "AP-R4", productKey: "AP", code: "R4", title: "Users can manage their profile" },
  { id: "OF-R1", productKey: "OF", code: "R1", title: "Tickets with custom statuses per product" },
  { id: "OF-R2", productKey: "OF", code: "R2", title: "Time tracking on tickets" },
  { id: "OF-R3", productKey: "OF", code: "R3", title: "Leadership dashboards computed from tickets" },
  { id: "NV-R1", productKey: "NV", code: "R1", title: "Authenticated inference endpoint" },
  { id: "NV-R2", productKey: "NV", code: "R2", title: "Usage metering per API key" },
];

export const tickets: Ticket[] = [
  // Acme Portal
  { key: "AP-3", productKey: "AP", title: "Portal epic: authentication", type: "epic", statusId: "ap-epic", color: "var(--color-purple)", assigneeIds: ["u-ayesha"], priority: "high", estimateH: 60, due: "2026-10-30", requirementId: "AP-R1", sprint: "Sprint 14",
    sections: {
      goal: "Acme customers can't get into the portal today without calling support. By the end of October they sign in, stay signed in safely, and reset a forgotten password on their own.",
      success_metrics: [
        { id: "sm1", text: "Password-reset support tickets down 80% in the first month", done: false },
        { id: "sm2", text: "95% of sign-ins succeed on the first try", done: false },
        { id: "sm3", text: "Passes Acme's security review", done: false },
      ],
      in_scope: [{ id: "is1", text: "Email + password sign-in" }, { id: "is2", text: "Session refresh and rate limiting" }, { id: "is3", text: "Forgotten-password flow" }],
      out_of_scope: [{ id: "os1", text: "SSO and two-factor sign-in (v2)" }],
      risks: [{ id: "r1", text: "Acme hasn't confirmed the email sender domain yet (blocks AP-20)" }, { id: "r2", text: "Assumes Acme's user list can be imported before launch" }],
      release_plan: "Staging review with Acme on Oct 22, production on Oct 30 behind a feature flag, then remove the old support-led reset.",
    } },
  { key: "AP-12", productKey: "AP", title: "Login page", type: "task", statusId: "ap-dev", assigneeIds: ["u-sara"], priority: "high", estimateH: 6, due: "2026-10-02", requirementId: "AP-R1", sprint: "Sprint 14", epicKey: "AP-3", dependsOn: ["AP-13"],
    sections: {
      goal: "Acme customers sign in to the portal with their email and password, so they can reach their account without calling support.",
      context: "First screen every Acme customer sees. Matches the approved Figma “Portal / Sign in” frame. The Auth API (AP-13) returns 401 for a wrong password and 429 after five tries.",
      acceptance_criteria: [
        { id: "ac1", text: "Email and password fields with labels; Enter submits", done: true },
        { id: "ac2", text: "A wrong password shows “Wrong email or password” under the form, the password field is cleared", done: true },
        { id: "ac3", text: "After 5 failed tries the form shows a 15-minute lockout message (API 429)", done: false },
        { id: "ac4", text: "“Remember me” keeps the session for 30 days; unticked, it ends when the browser closes", done: false },
        { id: "ac5", text: "Works with keyboard only and a screen reader announces errors", done: false },
      ],
      out_of_scope: [{ id: "os1", text: "Single sign-on (SSO) — planned for v2" }, { id: "os2", text: "Sign-up; accounts are created by Acme admins" }],
      technical_notes: "Next.js route /signin, server action posts to POST /auth/login (AP-13). Store the refresh token in an httpOnly cookie; never in localStorage. Reuse the shared <Field> and <Button> components.",
      test_plan: [
        { id: "tp1", text: "Happy path on Chrome, Safari, Firefox", done: false },
        { id: "tp2", text: "Wrong password, locked account, API down (500)", done: false },
        { id: "tp3", text: "VoiceOver + keyboard-only pass", done: false },
      ],
      definition_of_done: [{ id: "criteria_met", text: "Every acceptance criterion is met", done: false }, { id: "reviewed", text: "Code reviewed, approved and merged", done: false }],
    } },
  { key: "AP-13", productKey: "AP", title: "Auth API", type: "task", statusId: "ap-review", assigneeIds: ["u-sara"], priority: "high", estimateH: 8, due: "2026-09-30", requirementId: "AP-R1", sprint: "Sprint 14", pr: { number: 88, state: "approved" }, epicKey: "AP-3" },
  { key: "AP-14", productKey: "AP", title: "Session refresh tokens", type: "task", statusId: "ap-shipped", assigneeIds: ["u-zain"], priority: "medium", estimateH: 5, due: "2026-09-26", requirementId: "AP-R1", sprint: "Sprint 13", pr: { number: 81, state: "merged" }, epicKey: "AP-3" },
  { key: "AP-15", productKey: "AP", title: "Login rate limiting", type: "task", statusId: "ap-shipped", assigneeIds: ["u-zain"], priority: "high", estimateH: 3, due: "2026-09-25", requirementId: "AP-R1", sprint: "Sprint 13", epicKey: "AP-3" },
  { key: "AP-20", productKey: "AP", title: "Reset email", type: "task", statusId: "ap-blocked", assigneeIds: ["u-sara"], priority: "medium", estimateH: 2, due: "2026-10-03", requirementId: "AP-R2", sprint: "Sprint 14", epicKey: "AP-3", sections: { goal: "Send the password-reset email from Acme's own domain. Waiting on Acme to confirm the sender domain for transactional email." } },
  { key: "AP-21", productKey: "AP", title: "Reset password form", type: "task", statusId: "ap-qa", assigneeIds: ["u-daniyal"], priority: "medium", estimateH: 4, due: "2026-10-01", requirementId: "AP-R2", sprint: "Sprint 14", epicKey: "AP-3", dependsOn: ["AP-20"] },
  { key: "AP-22", productKey: "AP", title: "Token expiry edge case on reset link", type: "bug", statusId: "ap-ready", assigneeIds: ["u-zain"], priority: "critical", estimateH: 2, due: "2026-10-02", requirementId: "AP-R2", sprint: "Sprint 14", epicKey: "AP-3" },
  { key: "AP-25", productKey: "AP", title: "Profile settings page", type: "task", statusId: "ap-ready", assigneeIds: ["u-daniyal"], priority: "low", estimateH: 6, due: "2026-10-09", requirementId: "AP-R4", sprint: "Sprint 15" },
  { key: "AP-26", productKey: "AP", title: "Avatar upload", type: "task", statusId: "ap-backlog", priority: "low", estimateH: 3, requirementId: "AP-R4" },
  { key: "AP-30", productKey: "AP", title: "CSV report export", type: "task", statusId: "ap-backlog", priority: "medium", estimateH: 8, requirementId: "AP-R3" },
  { key: "AP-31", productKey: "AP", title: "PDF export", type: "task", statusId: "ap-wontdo", priority: "low", estimateH: 10, requirementId: "AP-R3", sections: { goal: "Dropped from v1 (decision Sep 20)." } },
  { key: "AP-33", productKey: "AP", title: "Session expires while typing", type: "bug", statusId: "ap-dev", assigneeIds: ["u-daniyal"], priority: "high", estimateH: 3, due: "2026-10-01", sprint: "Sprint 14", epicKey: "AP-3" },
  { key: "AP-1", productKey: "AP", title: "General (meetings & admin)", type: "task", statusId: "ap-dev", priority: "low", estimateH: 40 },
  // 1Fold
  { key: "OF-4", productKey: "OF", title: "Ticket board (table + kanban)", type: "task", statusId: "of-done", assigneeIds: ["u-ayesha"], priority: "high", estimateH: 16, due: "2026-09-29", requirementId: "OF-R1", pr: { number: 12, state: "merged" } },
  { key: "OF-7", productKey: "OF", title: "Custom statuses per product", type: "task", statusId: "of-review", assigneeIds: ["u-zain"], priority: "high", estimateH: 10, due: "2026-10-03", requirementId: "OF-R1", pr: { number: 15, state: "open" } },
  { key: "OF-9", productKey: "OF", title: "Timer + time entries", type: "task", statusId: "of-progress", assigneeIds: ["u-daniyal"], priority: "high", estimateH: 12, due: "2026-10-06", requirementId: "OF-R2" },
  { key: "OF-12", productKey: "OF", title: "Workflow editor", type: "task", statusId: "of-todo", assigneeIds: ["u-sara"], priority: "medium", estimateH: 8, due: "2026-10-08", requirementId: "OF-R1" },
  { key: "OF-14", productKey: "OF", title: "Weekly timesheet approval", type: "task", statusId: "of-todo", assigneeIds: ["u-usman"], priority: "medium", estimateH: 10, due: "2026-10-10", requirementId: "OF-R2" },
  { key: "OF-18", productKey: "OF", title: "Company home dashboard", type: "task", statusId: "of-backlog", priority: "medium", estimateH: 14, requirementId: "OF-R3" },
  { key: "OF-19", productKey: "OF", title: "Timer drifts after sleep", type: "bug", statusId: "of-stuck", assigneeIds: ["u-daniyal"], priority: "high", estimateH: 2, due: "2026-09-30", requirementId: "OF-R2" },
  // Nova
  { key: "NV-1", productKey: "NV", title: "Inference API contract", type: "task", statusId: "nv-progress", assigneeIds: ["u-maryam"], priority: "high", estimateH: 6, due: "2026-10-05", requirementId: "NV-R1" },
  { key: "NV-2", productKey: "NV", title: "Model packaging spike", type: "task", statusId: "nv-progress", assigneeIds: ["u-faraz"], priority: "medium", estimateH: 8, due: "2026-10-04", requirementId: "NV-R1" },
  { key: "NV-3", productKey: "NV", title: "Metering design", type: "task", statusId: "nv-todo", assigneeIds: ["u-faraz"], priority: "medium", estimateH: 5, requirementId: "NV-R2" },
  { key: "NV-4", productKey: "NV", title: "Kickoff workshop notes", type: "task", statusId: "nv-done", assigneeIds: ["u-maryam"], priority: "low", estimateH: 2 },
];

export const decisions: Decision[] = [
  { id: "d1", productKey: "AP", title: "Use Supabase Auth instead of custom login", why: "Saves ~40h, gives us MFA and audited password reset out of the box.", byId: "u-tayyab", date: "2026-09-28" },
  { id: "d2", productKey: "AP", title: "Drop PDF export from v1", why: "Client agreed CSV covers 90% of use; PDF moves to v1.1.", byId: "u-hina", date: "2026-09-20" },
  { id: "d3", productKey: "AP", title: "Next.js on Vercel for the portal", why: "Matches team skills; preview deploys per PR for client review.", byId: "u-tayyab", date: "2026-09-12" },
  { id: "d4", productKey: "OF", title: "Five fixed status categories", why: "Products keep their own statuses, reports stay comparable.", byId: "u-hina", date: "2026-09-30" },
  { id: "d5", productKey: "OF", title: "Time always belongs to a ticket", why: "Meetings go to a 'General' ticket so every hour is traceable.", byId: "u-tayyab", date: "2026-09-30" },
];

export const milestones: Milestone[] = [
  { id: "m1", productKey: "AP", name: "v1", due: "2026-10-30", pct: 62, lateDays: 5 },
  { id: "m2", productKey: "AP", name: "v1.1", due: "2026-12-15", pct: 5, lateDays: 0 },
  { id: "m3", productKey: "OF", name: "Phase 1 — replace Jira", due: "2026-11-15", pct: 44, lateDays: 0 },
  { id: "m4", productKey: "NV", name: "API beta", due: "2026-11-30", pct: 12, lateDays: 0 },
];

export const docs: Doc[] = [
  { id: "doc1", productKey: "AP", kind: "Brief", title: "Acme Portal — client brief", updated: "2026-09-02", authorId: "u-omar" },
  { id: "doc2", productKey: "AP", kind: "Requirements", title: "Portal v1 requirements", updated: "2026-09-28", authorId: "u-hina" },
  { id: "doc3", productKey: "AP", kind: "Design", title: "Login & reset flows (Figma)", updated: "2026-09-18", authorId: "u-ayesha" },
  { id: "doc4", productKey: "AP", kind: "Architecture", title: "Auth architecture", updated: "2026-09-27", authorId: "u-tayyab" },
  { id: "doc5", productKey: "AP", kind: "Meeting notes", title: "Weekly client sync — Sep 29", updated: "2026-09-29", authorId: "u-bilal" },
  { id: "doc6", productKey: "OF", kind: "Brief", title: "1Fold — why we're building it", updated: "2026-09-30", authorId: "u-tayyab" },
  { id: "doc7", productKey: "OF", kind: "Architecture", title: "Next.js + Supabase, org-scoped RLS", updated: "2026-09-30", authorId: "u-tayyab" },
  { id: "doc8", productKey: "NV", kind: "Brief", title: "Nova triage API — brief", updated: "2026-09-24", authorId: "u-hina" },
];



export const stageRequests: StageRequest[] = [];

export const activity: Activity[] = [
  { id: "a1", ticketKey: "AP-12", at: "2026-09-24T10:12:00", actorId: "u-hina", field: "Created", to: "Backlog" },
  { id: "a2", ticketKey: "AP-12", at: "2026-09-26T09:00:00", actorId: "u-bilal", field: "Status", from: "Backlog", to: "Ready" },
  { id: "a3", ticketKey: "AP-12", at: "2026-09-26T09:01:00", actorId: "u-bilal", field: "Assignee", from: "—", to: "Sara Ahmed" },
  { id: "a4", ticketKey: "AP-12", at: "2026-09-28T08:45:00", actorId: "u-sara", field: "Status", from: "Ready", to: "In Dev" },
  { id: "a5", ticketKey: "AP-12", at: "2026-09-30T16:20:00", actorId: "u-bilal", field: "Due date", from: "Sep 30", to: "Oct 2" },
  { id: "a6", ticketKey: "AP-13", at: "2026-09-30T18:02:00", actorId: "u-sara", field: "Status", from: "In Dev", to: "Review" },
  { id: "a7", ticketKey: "AP-20", at: "2026-09-30T11:30:00", actorId: "u-sara", field: "Status", from: "In Dev", to: "Blocked" },
];

export const comments: Comment[] = [
  { id: "c1", ticketKey: "AP-12", authorId: "u-ayesha", at: "2026-09-29T14:05:00", body: "@Sara Ahmed designs are final in the Login & reset flows doc. Error copy is in the requirements." },
  { id: "c2", ticketKey: "AP-12", authorId: "u-sara", at: "2026-09-30T17:40:00", body: "Form + validation done. Wiring it to Supabase Auth now (decision from Sep 28)." },
  { id: "c3", ticketKey: "AP-20", authorId: "u-bilal", at: "2026-09-30T12:00:00", body: "Asked Acme for the sender domain. @Laura Chen (Acme) can you confirm by Friday?" },
];

export const notifications: Notification[] = [
  { personId: "u-tayyab", id: "n1", kind: "approval", actorId: "u-hina", text: "Orbit is waiting for intake approval", target: "OR", at: "2026-10-01T08:30:00", read: false },
  { personId: "u-sara", id: "n2", kind: "mention", actorId: "u-ayesha", text: "mentioned you on AP-12 Login page", target: "AP-12", at: "2026-09-29T14:05:00", read: false },
  { personId: "u-sara", id: "n3", kind: "assigned", actorId: "u-bilal", text: "assigned you AP-20 Reset email", target: "AP-20", at: "2026-09-26T09:01:00", read: true },
  { personId: "u-sara", id: "n4", kind: "status", actorId: "u-zain", text: "moved OF-7 to Code Review", target: "OF-7", at: "2026-09-30T19:10:00", read: true },
];
