// What the Client tab can do, given by whoever shows it: the team's screen (TeamRoom) or the client's (ClientRoom).
// Buttons only appear when their action is given — a client never gets the team's, and a preview gets none.
import type { ReactNode } from "react";
import type { RoomThread } from "@/domain/selectors/room";
import type { AskKind } from "@/domain/types";

export interface RoomActions {
  /** A message in a chat — to the client, or a note only the team sees. False: refused (a toast says why). */
  send?: (subject: string, body: string, opts: { note?: boolean; replyTo?: string }) => Promise<boolean>;
  upload?: (subject: string, file: File, note: boolean) => Promise<boolean>;
  fileUrl: (id: string, download?: boolean) => string;
  // a line, after it's sent — either side
  deleteMessage?: (messageId: string, everyone: boolean) => void;
  star?: (messageId: string, on: boolean) => void;
  pin?: (messageId: string, on: boolean) => void;
  /** Read up to `at` — keeps unread counts and the other side's ticks, on any device. Quiet: never a toast. */
  markRead?: (subject: string, at: string) => void;
  // the client's
  confirm?: (reqId: string) => Promise<boolean>;
  askChanges?: (reqId: string, body: string) => Promise<boolean>;
  answer?: (askId: string, body: string) => Promise<boolean>;
  markDone?: (askId: string) => Promise<boolean>;
  suggest?: () => void;
  // the team's
  sendToClient?: (reqId: string) => void;
  takeOn?: (reqId: string) => void;
  decline?: (reqId: string) => void;
  remind?: (subject: string) => void;
  setAskState?: (askId: string, state: "done" | "cancelled" | "open") => void;
  createTicket?: (t: RoomThread, title?: string) => void;
  makeRequirement?: (title: string) => void;
  makeRequest?: (title: string) => void;
  newRequirement?: () => void;
  newRequest?: (kind?: AskKind) => void;
  weeklyUpdate?: () => void;
  openRequirement?: (reqId: string) => void;
  /** Off both boards (the team's and the client's), into Settings → Archived — undoable from the toast. */
  archive?: (reqId: string) => void;
  setPriority?: (reqId: string, priority: string | null) => void;
  /** The people on the project, with what the team can do about them (the project chat's details). */
  people?: () => ReactNode;
}
