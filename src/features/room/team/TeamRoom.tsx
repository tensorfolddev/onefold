"use client";

// The team's Client tab for one project: its room (domain/selectors/room.ts) with the team's actions — write to the
// client or a note, send requirements to confirm, ask for things, remind, close, make tickets — plus the dialogs and
// the requirement panel those open.
import { useMemo, useState } from "react";
import { notFound, usePathname, useRouter, useSearchParams } from "next/navigation";
import { upload as uploadBytes, message } from "@/data/api";
import {
  acceptProposal, addRequirement, archiveRequirements, createTicket, deleteChatMessage, dropRequirement, pinChatMessage, postThreadMessage, readChat, remindClient,
  sendRequirementToClient, setAskState, starChatMessage, updateRequirement, updateTicket,
} from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { teamRoom, type RoomThread } from "@/domain/selectors/room";
import type { AskKind } from "@/domain/types";
import { useAppState } from "@/features/shell/state";
import { NewRequirement } from "@/features/requirements/NewRequirement";
import { RequirementPanel } from "@/features/requirements/RequirementPanel";
import { Room } from "../Room";
import type { RoomActions } from "../roomActions";
import { NewRequestDialog, WeeklyUpdateDialog } from "./TeamDialogs";
import { TeamPeople } from "./TeamPeople";

type Dialog = { kind: "requirement" } | { kind: "request"; ask?: AskKind; title?: string } | { kind: "update" } | null;

export function TeamRoom({ productKey }: { productKey: string }) {
  const { db, me, act, can, toast, productByKey } = useMe();
  const canArchive = can("requirement.archive", { product: productByKey(productKey) });
  const { openTicket } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const room = useMemo(() => teamRoom(db, me, productKey), [db, me, productKey]);
  const [panel, setPanel] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const legacy = params.get("req"); // links from before the chats: ?req=<id>
  const subject = params.get("t") ?? (legacy ? `req:${legacy}` : null);
  const open = (s: string | null) => router.replace(s ? `${pathname}?t=${encodeURIComponent(s)}` : pathname, { scroll: false }); // null: the chat closed

  const actions: RoomActions = useMemo(() => ({
    fileUrl: (id, download) => `/api/files/${id}${download ? "?download=1" : ""}`,
    send: async (s, body, opts) => !!act((d, m) => postThreadMessage(d, m, s, body, crypto.randomUUID(), opts)),
    deleteMessage: (id, everyone) => { act((d, m) => deleteChatMessage(d, m, id, everyone), { success: everyone ? "Deleted for everyone" : "Deleted for you" }); },
    star: (id, on) => { act((d, m) => starChatMessage(d, m, id, on), { success: on ? "Starred — only you see it" : "Unstarred" }); },
    pin: (id, on) => { act((d, m) => pinChatMessage(d, m, id, on), { success: on ? "Pinned for everyone" : "Unpinned" }); },
    markRead: (s, at) => { act((d, m) => readChat(d, m, s, at)); },
    setPriority: (id, priority) => { act((d, m) => updateRequirement(d, m, id, { priority })); },
    upload: async (s, file, note) => {
      try {
        await uploadBytes(`/api/files?thread=${encodeURIComponent(s)}&name=${encodeURIComponent(file.name)}${note ? "&note=1" : ""}`, file);
        return true;
      } catch (e) {
        toast(message(e), undefined, "error");
        return false;
      }
    },
    sendToClient: (id) => { act((d, m) => sendRequirementToClient(d, m, id), { success: "Sent to the client to confirm" }); },
    takeOn: (id) => { act((d, m) => acceptProposal(d, m, id), { success: "Taken on — write it up, then send it back to confirm" }); setPanel(id); },
    decline: (id) => { act((d, m) => dropRequirement(d, m, id, "Not for now"), { success: "Dropped — the client sees it as not for now", undoable: true }); },
    remind: (s) => { act((d, m) => remindClient(d, m, s), { success: "Reminder sent" }); },
    setAskState: (id, state) => { act((d, m) => setAskState(d, m, id, state), { success: state === "done" ? "Closed" : state === "open" ? "Open again" : "Called off" }); },
    createTicket: (t: RoomThread, title?: string) => {
      const key = act((d, m) => {
        const made = createTicket(d, m, productKey, title ?? t.title);
        return { db: t.requirement ? updateTicket(made.db, m, made.key, { requirementId: t.requirement.id }) : made.db, key: made.key };
      });
      if (typeof key === "string") { toast(`${key} created${t.requirement ? ` for ${t.key}` : ""}`, undefined, "success"); openTicket(key); }
    },
    makeRequirement: (title) => {
      const id = crypto.randomUUID();
      if (act((d, m) => addRequirement(d, m, productKey, { title }, id), { success: "Added as a team draft" })) { open(`req:${id}`); setPanel(id); }
    },
    makeRequest: (title) => setDialog({ kind: "request", title }),
    newRequirement: () => setDialog({ kind: "requirement" }),
    newRequest: (ask) => setDialog({ kind: "request", ask }),
    weeklyUpdate: () => setDialog({ kind: "update" }),
    openRequirement: (id) => setPanel(id),
    archive: canArchive ? (id) => {
      if (act((d, m) => archiveRequirements(d, m, [id]), { success: "Requirement archived — it's in Settings → Archived", undoable: true })) { setPanel(null); open(null); }
    } : undefined, // admins only
    people: () => <TeamPeople productKey={productKey} />,
  }), [act, toast, openTicket, productKey, canArchive]); // eslint-disable-line react-hooks/exhaustive-deps -- `open` only reads the URL
  if (!room) notFound();
  const requirement = panel ? db.requirements.find((r) => r.id === panel) : undefined;
  return (
    <>
      <Room room={room} actions={actions} subject={subject} onSubject={open} />
      {requirement && <RequirementPanel key={requirement.id} requirement={requirement} onClose={() => setPanel(null)} />}
      {dialog?.kind === "requirement" && (
        <NewRequirement productKey={productKey} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); open(`req:${id}`); setPanel(id); }} />
      )}
      {dialog?.kind === "request" && (
        <NewRequestDialog productKey={productKey} kind={dialog.ask} title={dialog.title} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); open(`ask:${id}`); }} />
      )}
      {dialog?.kind === "update" && <WeeklyUpdateDialog productKey={productKey} onClose={() => setDialog(null)} onPosted={() => { setDialog(null); open(`chat:${productKey}`); }} />}
    </>
  );
}
