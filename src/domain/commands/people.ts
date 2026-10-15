import type { Person } from "../types.ts";
import type { Db } from "../../data/db.ts";
import { check, fail, id, initialsOf, personOf, replace, requiredError, ValidationError } from "./shared.ts";

// ---------- people + teams ----------
// People join by invite (org.ts) or by creating the company. Admins edit access, roles and teams here.
// A person's email is their login, so it changes on the server (with verification), not here.
const jobTitleError = (db: Db, role: string) => (db.jobTitles.includes(role) ? null : "Pick a job title from the list");

export type PersonPatch = Partial<Pick<Person, "name" | "role" | "panel" | "team" | "active">>;

export function updatePerson(db: Db, me: Person, pid: string, patch: PersonPatch): Db {
  check(me, "people.manage", {});
  personOf(db, pid);
  if (pid === me.id && (("panel" in patch && patch.panel !== me.panel) || ("active" in patch && patch.active !== me.active))) {
    throw new ValidationError("You can't change your own access");
  }
  if (patch.name !== undefined) fail(requiredError("Name", patch.name));
  if (patch.role !== undefined) fail(jobTitleError(db, patch.role));
  const clean = {
    ...patch,
    ...(patch.name !== undefined && { name: patch.name.trim(), initials: initialsOf(patch.name) }),
  };
  return { ...db, people: replace(db.people, (p) => p.id === pid, (p) => ({ ...p, ...clean })) };
}

// ---------- job titles (admin-managed list used by every job-title picker) ----------
export function addJobTitle(db: Db, me: Person, title: string): Db {
  check(me, "people.manage", {});
  fail(requiredError("Job title", title));
  if (db.jobTitles.some((t) => t.toLowerCase() === title.trim().toLowerCase())) throw new ValidationError("That job title already exists");
  return { ...db, jobTitles: [...db.jobTitles, title.trim()] };
}

/** Renaming moves everyone with the old title to the new one. */
export function renameJobTitle(db: Db, me: Person, from: string, to: string): Db {
  check(me, "people.manage", {});
  fail(requiredError("Job title", to));
  const name = to.trim();
  if (db.jobTitles.some((t) => t !== from && t.toLowerCase() === name.toLowerCase())) throw new ValidationError("That job title already exists");
  return {
    ...db,
    jobTitles: db.jobTitles.map((t) => (t === from ? name : t)),
    people: db.people.map((p) => (p.role === from ? { ...p, role: name } : p)),
  };
}

export function deleteJobTitle(db: Db, me: Person, title: string): Db {
  check(me, "people.manage", {});
  const using = db.people.filter((p) => p.role === title).length;
  if (using) throw new ValidationError(`${using} ${using === 1 ? "person has" : "people have"} this job title — change theirs first`);
  return { ...db, jobTitles: db.jobTitles.filter((t) => t !== title) };
}

export function deleteTeam(db: Db, me: Person, teamId: string): Db {
  check(me, "teams.manage", {});
  const using = db.people.filter((p) => p.team === teamId).length;
  if (using) throw new ValidationError(`${using} ${using === 1 ? "person is" : "people are"} on this team — move them first`);
  return { ...db, teams: db.teams.filter((t) => t.id !== teamId) };
}

export function addTeam(db: Db, me: Person, name: string): Db {
  check(me, "teams.manage", {});
  fail(requiredError("Team name", name));
  if (db.teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) throw new ValidationError("A team with this name already exists");
  return { ...db, teams: [...db.teams, { id: `team-${id().slice(0, 8)}`, name: name.trim(), leadId: "" }] };
}

export function updateTeam(db: Db, me: Person, teamId: string, patch: { name?: string; leadId?: string }): Db {
  check(me, "teams.manage", {});
  if (patch.name !== undefined) fail(requiredError("Team name", patch.name));
  return { ...db, teams: replace(db.teams, (t) => t.id === teamId, (t) => ({ ...t, ...patch, ...(patch.name && { name: patch.name.trim() }) })) };
}
