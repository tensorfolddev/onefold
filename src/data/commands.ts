// The commands the screens call. Same names and behaviour as the domain's (src/domain/commands), but while the store
// runs a change (`record`), every call is also written down as a step — so the server can replay exactly the same
// steps on the real data. Outside a change (e.g. a form's dry-run to show an inline error) nothing is recorded.
import { commands as domain, type CommandName, type Commands } from "../domain/commands/index.ts";

export * from "../domain/commands/index.ts";

export interface Step { name: CommandName; args: unknown[] }
let recording: Step[] | null = null;

/** Runs `fn`, collecting the commands it calls, in order. */
export function record<T>(fn: () => T): { result: T; steps: Step[] } {
  const outer = recording;
  recording = [];
  try {
    const result = fn();
    return { result, steps: recording };
  } finally {
    recording = outer;
  }
}

function wrap<N extends CommandName>(name: N): Commands[N] {
  const run = domain[name] as unknown as (...args: unknown[]) => unknown;
  return ((db: unknown, me: unknown, ...args: unknown[]) => {
    recording?.push({ name, args: structuredClone(args) });
    return run(db, me, ...args);
  }) as unknown as Commands[N];
}

/** Every command, recorded — for the store's `run(name, args)`. */
export const recorded = Object.fromEntries((Object.keys(domain) as CommandName[]).map((name) => [name, wrap(name)])) as unknown as Commands;

export const createTicket = wrap("createTicket");
export const updateTicket = wrap("updateTicket");
export const moveTicket = wrap("moveTicket");
export const deleteTickets = wrap("deleteTickets");
export const archiveTickets = wrap("archiveTickets");
export const restoreTickets = wrap("restoreTickets");
export const addComment = wrap("addComment");
export const addRequirement = wrap("addRequirement");
export const updateRequirement = wrap("updateRequirement");
export const markRequirementConfirmed = wrap("markRequirementConfirmed");
export const dropRequirement = wrap("dropRequirement");
export const archiveRequirements = wrap("archiveRequirements");
export const unarchiveRequirements = wrap("unarchiveRequirements");
export const restoreRequirement = wrap("restoreRequirement");
export const deleteRequirement = wrap("deleteRequirement");
export const setClientSettings = wrap("setClientSettings");
export const setProductClient = wrap("setProductClient");
export const setClientActive = wrap("setClientActive");
export const createAsk = wrap("createAsk");
export const updateAsk = wrap("updateAsk");
export const setAskState = wrap("setAskState");
export const postThreadMessage = wrap("postThreadMessage");
export const remindClient = wrap("remindClient");
export const postUpdate = wrap("postUpdate");
export const sendRequirementToClient = wrap("sendRequirementToClient");
export const acceptProposal = wrap("acceptProposal");
export const setClientLook = wrap("setClientLook");
export const deleteChatMessage = wrap("deleteChatMessage");
export const starChatMessage = wrap("starChatMessage");
export const pinChatMessage = wrap("pinChatMessage");
export const readChat = wrap("readChat");
export const setupVault = wrap("setupVault");
export const rewrapVault = wrap("rewrapVault");
export const shareItems = wrap("shareItems");
export const grantVault = wrap("grantVault");
export const inviteToVault = wrap("inviteToVault");
export const cancelVaultInvite = wrap("cancelVaultInvite");
export const rekeyVault = wrap("rekeyVault");
export const upsertVaultItem = wrap("upsertVaultItem");
export const deleteVaultItem = wrap("deleteVaultItem");
export const resetVault = wrap("resetVault");
export const setSection = wrap("setSection");
export const addDependency = wrap("addDependency");
export const removeDependency = wrap("removeDependency");
export const addAttachment = wrap("addAttachment");
export const removeAttachment = wrap("removeAttachment");
export const addStatus = wrap("addStatus");
export const updateStatus = wrap("updateStatus");
export const moveStatus = wrap("moveStatus");
export const deleteStatus = wrap("deleteStatus");
export const createProduct = wrap("createProduct");
export const updateProduct = wrap("updateProduct");
export const setProductLook = wrap("setProductLook");
export const setPriority = wrap("setPriority");
export const markNotificationsRead = wrap("markNotificationsRead");
export const setPhoto = wrap("setPhoto");
export const deleteNotifications = wrap("deleteNotifications");
export const setMember = wrap("setMember");
export const requestStage = wrap("requestStage");
export const approveStage = wrap("approveStage");
export const addGroup = wrap("addGroup");
export const renameGroup = wrap("renameGroup");
export const deleteGroup = wrap("deleteGroup");
export const moveProduct = wrap("moveProduct");
export const archiveProduct = wrap("archiveProduct");
export const restoreProduct = wrap("restoreProduct");
export const deleteProduct = wrap("deleteProduct");
export const addDoc = wrap("addDoc");
export const deleteDoc = wrap("deleteDoc");
// New docs are made by POST /api/docs (the server also writes the first body), never as a replayed step.
export const updateDoc = wrap("updateDoc");
export const updateDecision = wrap("updateDecision");
export const archiveDecisions = wrap("archiveDecisions");
export const restoreDecisions = wrap("restoreDecisions");
export const moveDoc = wrap("moveDoc");
export const archiveDocs = wrap("archiveDocs");
export const restoreDocs = wrap("restoreDocs");
export const deleteDocs = wrap("deleteDocs");
export const addDocGroup = wrap("addDocGroup");
export const renameDocGroup = wrap("renameDocGroup");
export const deleteDocGroup = wrap("deleteDocGroup");
export const setDocGroup = wrap("setDocGroup");
export const shareDoc = wrap("shareDoc");
export const addDecision = wrap("addDecision");
export const upsertMilestone = wrap("upsertMilestone");
export const updatePerson = wrap("updatePerson");
export const addJobTitle = wrap("addJobTitle");
export const renameJobTitle = wrap("renameJobTitle");
export const deleteJobTitle = wrap("deleteJobTitle");
export const addTeam = wrap("addTeam");
export const updateTeam = wrap("updateTeam");
export const deleteTeam = wrap("deleteTeam");
export const revokeInvite = wrap("revokeInvite");
export const updateOrg = wrap("updateOrg");
