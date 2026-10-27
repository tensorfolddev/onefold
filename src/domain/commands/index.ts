// Every change to a company's data is one of these named commands: pure (db, me, ...args) → db.
// The browser store runs them now; the backend (and the MCP server's tools) will run the same names.
import {
  addDecision, addDoc, addDocGroup, archiveDecisions, restoreDecisions, updateDecision, archiveDocs, createDoc, deleteDoc, deleteDocGroup, deleteDocs, moveDoc, notifyDocMentions, renameDocGroup, restoreDocs,
  setDocGroup, setDocLink, setDocPublic, shareDoc, touchDoc, updateDoc, upsertMilestone,
} from "./docs.ts";
import { addStatus, deleteStatus, moveStatus, updateStatus } from "./lists.ts";
import { deleteNotifications, markNotificationsRead } from "./notify.ts";
import { inviteMembers, revokeInvite, updateOrg } from "./org.ts";
import {
  addJobTitle, addTeam, deleteJobTitle, deleteTeam, renameJobTitle, setPhoto, updatePerson, updateTeam,
} from "./people.ts";
import {
  addGroup, approveStage, archiveProduct, createProduct, deleteGroup, deleteProduct, moveProduct, renameGroup, requestStage,
  restoreProduct, setMember, setPriority, setProductLook, updateProduct,
} from "./products.ts";
import {
  addRequirement, archiveRequirements, deleteRequirement, dropRequirement, markRequirementConfirmed, restoreRequirement, unarchiveRequirements, updateRequirement,
} from "./requirements.ts";
import {
  acceptProposal, addClientPerson, addThreadFile, createAsk, deleteChatMessage, pinChatMessage, postThreadMessage, postUpdate, readChat, remindClient,
  sendRequirementToClient, setAskState, setClientActive, setClientLook, setClientSettings, setProductClient, starChatMessage, updateAsk,
} from "./clients.ts";
import { addAttachment, addDependency, removeAttachment, removeDependency, setSection } from "./template.ts";
import {
  cancelVaultInvite, deleteVaultItem, grantVault, inviteToVault, rekeyVault, resetVault, rewrapVault, setupVault, shareItems, upsertVaultItem,
} from "./vault.ts";
import { addComment, archiveTickets, createTicket, deleteTickets, moveTicket, restoreTickets, updateTicket } from "./tickets.ts";

export const commands = {
  // tickets
  createTicket, updateTicket, moveTicket, deleteTickets, addComment, archiveTickets, restoreTickets,
  setSection, addDependency, removeDependency, addAttachment, removeAttachment,
  // board lists
  addStatus, updateStatus, moveStatus, deleteStatus,
  // products
  createProduct, updateProduct, setProductLook, setPriority, setMember, requestStage, approveStage, addGroup, renameGroup, deleteGroup,
  moveProduct, archiveProduct, restoreProduct, deleteProduct,
  // docs
  addDoc, deleteDoc, addDecision, updateDecision, archiveDecisions, restoreDecisions, upsertMilestone, createDoc, updateDoc, moveDoc, archiveDocs, restoreDocs, deleteDocs, touchDoc, setDocLink, setDocPublic, shareDoc, notifyDocMentions,
  addDocGroup, renameDocGroup, deleteDocGroup, setDocGroup,
  // requirements
  addRequirement, updateRequirement, markRequirementConfirmed, dropRequirement, restoreRequirement, deleteRequirement, archiveRequirements, unarchiveRequirements,
  // Client Space (the team's side)
  setClientSettings, setClientLook, addClientPerson, setProductClient, setClientActive, createAsk, updateAsk, setAskState, postThreadMessage, addThreadFile, remindClient, postUpdate, sendRequirementToClient, acceptProposal,
  deleteChatMessage, starChatMessage, pinChatMessage, readChat,
  // the vault (ciphertext only)
  setupVault, rewrapVault, shareItems, grantVault, inviteToVault, cancelVaultInvite, rekeyVault, upsertVaultItem, deleteVaultItem, resetVault,
  // people + company
  updatePerson, setPhoto, addJobTitle, renameJobTitle, deleteJobTitle, addTeam, updateTeam, deleteTeam,
  inviteMembers, revokeInvite, updateOrg,
  // notifications
  markNotificationsRead, deleteNotifications,
};

// The UI composes several into one change with act(); the names stay the same.
export {
  createTicket, updateTicket, moveTicket, deleteTickets, addComment, archiveTickets, restoreTickets,
  setSection, addDependency, removeDependency, addAttachment, removeAttachment,
  addStatus, updateStatus, moveStatus, deleteStatus,
  createProduct, updateProduct, setProductLook, setPriority, setMember, requestStage, approveStage, addGroup, renameGroup, deleteGroup,
  moveProduct, archiveProduct, restoreProduct, deleteProduct,
  addDoc, deleteDoc, addDecision, updateDecision, archiveDecisions, restoreDecisions, upsertMilestone, createDoc, updateDoc, moveDoc, archiveDocs, restoreDocs, deleteDocs, touchDoc, setDocLink, setDocPublic, shareDoc, notifyDocMentions,
  addDocGroup, renameDocGroup, deleteDocGroup, setDocGroup,
  // requirements
  addRequirement, updateRequirement, markRequirementConfirmed, dropRequirement, restoreRequirement, deleteRequirement, archiveRequirements, unarchiveRequirements,
  // Client Space (the team's side)
  setClientSettings, setClientLook, addClientPerson, setProductClient, setClientActive, createAsk, updateAsk, setAskState, postThreadMessage, addThreadFile, remindClient, postUpdate, sendRequirementToClient, acceptProposal,
  deleteChatMessage, starChatMessage, pinChatMessage, readChat,
  setupVault, rewrapVault, shareItems, grantVault, inviteToVault, cancelVaultInvite, rekeyVault, upsertVaultItem, deleteVaultItem, resetVault,
  updatePerson, setPhoto, addJobTitle, renameJobTitle, deleteJobTitle, addTeam, updateTeam, deleteTeam,
  inviteMembers, revokeInvite, updateOrg,
  // notifications
  markNotificationsRead, deleteNotifications,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;

export { AccessError, ValidationError } from "./shared.ts";
export { deletePhrase, DEFAULT_PRIORITY_NAME, PRIORITIES } from "./products.ts";
export { ticketDeletePhrase } from "./tickets.ts";
export { DECISION_STATUSES, docDeletePhrase, mentionable, withSubpages } from "./docs.ts";
export type { DecisionInput, DecisionPatch } from "./docs.ts";
export type { DocPatch, NewDoc } from "./docs.ts";
export { VAULT_COMMANDS, type ShareInput } from "./vault.ts";
export { acceptInvite, inviteProblem, inviteState, isFreeMail, signUp, slugError, slugify, INVITE_DAYS } from "./org.ts";
export { EMAIL_RE, MIN_PASSWORD, domainOf } from "./shared.ts";
export type { InviteInput, NewInvite, SignUpInput } from "./org.ts";
export type { TicketPatch } from "./tickets.ts";
export type { RequirementInput, RequirementPatch } from "./requirements.ts";
export { ASK_KINDS, CLIENT_ROLES } from "./clients.ts";
export type { AskInput } from "./clients.ts";
export type { StatusPatch } from "./lists.ts";
export type { PersonPatch } from "./people.ts";
export type { ProductInput } from "./products.ts";
