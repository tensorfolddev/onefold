// What a new doc can start from. Bodies are Markdown in the exact form the editor writes, so a template opens and
// saves without changing a character (checked in markdown.test.ts).
import type { DocKind } from "./types.ts";

export type DocSpace = "project" | "company";

export interface DocTemplate {
  id: string;
  name: string;
  icon: string;
  kind: DocKind;
  spaces: DocSpace[];
  blurb: string;
  body: string;
}

const both: DocSpace[] = ["project", "company"];

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: "blank", name: "Blank page", icon: "📄", kind: "Brief", spaces: both, blurb: "Start from nothing", body: "" },
  {
    id: "brief", name: "Project brief", icon: "🎯", kind: "Brief", spaces: ["project"], blurb: "Who it's for, the problem, the goal",
    body: `## Who it's for

Describe the people this serves.

## The problem

What hurts today, and how we know.

## The goal

> [!TIP]
> One sentence a newcomer would understand.

## Scope

- In:
- Out:

## Budget and dates

| Item   | Target |
| ------ | ------ |
| Budget |        |
| Launch |        |`,
  },
  {
    id: "requirements", name: "Requirements", icon: "📋", kind: "Requirements", spaces: ["project"], blurb: "What it must do, and how we'll know",
    body: `## Must have

- [ ] The first thing it must do

## Should have

- [ ] Nice to have, if time allows

## Won't have (this time)

- Out of scope for now

## Acceptance

> [!IMPORTANT]
> How we will test that each must-have works.`,
  },
  {
    id: "design", name: "Design doc", icon: "🎨", kind: "Design", spaces: ["project"], blurb: "Context, proposal, alternatives",
    body: `## Context

What exists today and why it needs to change.

## Proposal

How it will work.

## Alternatives considered

1. Do nothing
2. Another way

## Risks

> [!WARNING]
> What could go wrong, and how we'd notice.

## Open questions

- [ ] What we still need to decide`,
  },
  {
    id: "adr", name: "Architecture decision", icon: "🏛️", kind: "Architecture", spaces: ["project"], blurb: "One decision, its reasons and consequences",
    body: `## Status

Proposed

## Decision

What we decided, in one paragraph.

## Why

The forces that led here.

## Consequences

- Good:
- Costs:`,
  },
  {
    id: "meeting", name: "Meeting notes", icon: "🗓️", kind: "Meeting notes", spaces: both, blurb: "Agenda, notes, decisions, actions",
    body: `## Attendees

- Who was there

## Agenda

1. First topic

## Notes

## Decisions

- What we agreed

## Action items

- [ ] Who does what, by when`,
  },
  {
    id: "postmortem", name: "Postmortem", icon: "🩺", kind: "Architecture", spaces: ["project"], blurb: "What happened, why, what changes",
    body: `> [!NOTE]
> Blameless: we look at systems, not people.

## Summary

## Timeline

| Time  | What happened     |
| ----- | ----------------- |
| 09:00 | First alert fired |

## Root cause

## What went well

- Something that helped

## What we'll change

- [ ] One concrete fix, with an owner`,
  },
  {
    id: "weekly", name: "Weekly update", icon: "📈", kind: "Meeting notes", spaces: both, blurb: "Done, next, blocked",
    body: `## Done this week

- Shipped

## Next week

- Planned

## Blocked

> [!WARNING]
> Anything waiting on someone else.`,
  },
  {
    id: "handbook", name: "Handbook page", icon: "📘", kind: "Brief", spaces: ["company"], blurb: "How we work, written down",
    body: `## Why this exists

## How it works

1. The first step

## Who to ask

- The owner of this page`,
  },
  {
    id: "onboarding", name: "Onboarding", icon: "👋", kind: "Brief", spaces: ["company"], blurb: "A new teammate's first weeks",
    body: `## Before day one

- [ ] Laptop and accounts
- [ ] Welcome message

## First week

- [ ] Meet the team
- [ ] Ship something small

## First month

- [ ] Own a feature end to end

> [!TIP]
> Pair a newcomer with a buddy for their first two weeks.`,
  },
];

export const templateFor = (id: string | undefined) => DOC_TEMPLATES.find((t) => t.id === id);
export const templatesFor = (space: DocSpace) => DOC_TEMPLATES.filter((t) => t.spaces.includes(space));
