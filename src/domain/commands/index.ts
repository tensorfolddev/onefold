// Every change to a company's data is one of these named commands: pure (db, me, ...args) → db.
// The browser store runs them now; the backend (and the MCP server's tools) will run the same names.
import { addDecision, addDoc, deleteDoc, upsertMilestone } from "./docs.ts";
import { addStatus, deleteStatus, moveStatus, updateStatus } from "./lists.ts";
import { inviteMembers, revokeInvite, updateOrg } from "./org.ts";
import {
  addJobTitle, addTeam, deleteJobTitle, deleteTeam, renameJobTitle, updatePerson, updateTeam,
} from "./people.ts";
import {
  addGroup, approveStage, createProduct, deleteGroup, renameGroup, requestStage, setMember, setProductLook, updateProduct,
} from "./products.ts";
import { addAttachment, addDependency, removeAttachment, removeDependency, setSection } from "./template.ts";
import { addComment, createTicket, deleteTickets, moveTicket, updateTicket } from "./tickets.ts";

export const commands = {
  // tickets
  createTicket, updateTicket, moveTicket, deleteTickets, addComment,
  setSection, addDependency, removeDependency, addAttachment, removeAttachment,
  // board lists
  addStatus, updateStatus, moveStatus, deleteStatus,
  // products
  createProduct, updateProduct, setProductLook, setMember, requestStage, approveStage, addGroup, renameGroup, deleteGroup,
  // product docs
  addDoc, deleteDoc, addDecision, upsertMilestone,
  // people + company
  updatePerson, addJobTitle, renameJobTitle, deleteJobTitle, addTeam, updateTeam, deleteTeam,
  inviteMembers, revokeInvite, updateOrg,
};

// The UI composes several into one change with act(); the names stay the same.
export {
  createTicket, updateTicket, moveTicket, deleteTickets, addComment,
  setSection, addDependency, removeDependency, addAttachment, removeAttachment,
  addStatus, updateStatus, moveStatus, deleteStatus,
  createProduct, updateProduct, setProductLook, setMember, requestStage, approveStage, addGroup, renameGroup, deleteGroup,
  addDoc, deleteDoc, addDecision, upsertMilestone,
  updatePerson, addJobTitle, renameJobTitle, deleteJobTitle, addTeam, updateTeam, deleteTeam,
  inviteMembers, revokeInvite, updateOrg,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;

export { AccessError, ValidationError } from "./shared.ts";
export { acceptInvite, inviteProblem, inviteState, isFreeMail, signUp, slugError, slugify, INVITE_DAYS } from "./org.ts";
export { EMAIL_RE, MIN_PASSWORD, domainOf } from "./shared.ts";
export type { InviteInput, NewInvite, SignUpInput } from "./org.ts";
export type { TicketPatch } from "./tickets.ts";
export type { StatusPatch } from "./lists.ts";
export type { PersonPatch } from "./people.ts";
export type { ProductInput } from "./products.ts";
