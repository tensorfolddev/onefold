"use client";

// "Send to client" in a requirement's own panel (the same as the card's button in its chat), and "Take it on" for one
// the client suggested.
import { Send } from "lucide-react";
import { acceptProposal, sendRequirementToClient } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { statusOfRequirement } from "@/domain/selectors/requirements";
import type { Requirement } from "@/domain/types";

/** In the panel's top bar: "Send to client" for a draft (or one they asked to change), "Take it on" for a suggestion. */
export function ClientShareButton({ r }: { r: Requirement }) {
  const { db, act, can, productByKey } = useMe();
  const product = productByKey(r.productKey);
  if (!db.org.clientSpace || !product || !can("requirement.edit", { product })) return null;
  const status = statusOfRequirement(r);
  if (status === "proposed") {
    return <button type="button" className="btn btn-primary btn-sm" onClick={() => act((d, m) => acceptProposal(d, m, r.id), { success: `${r.code} taken on — write it up, then send it back to confirm` })}>Take it on</button>;
  }
  if (status !== "draft" && status !== "changes_requested") return null;
  const decider = (product.clients ?? []).some((c) => c.role !== "tester" && db.clientPeople.find((p) => p.id === c.personId)?.active);
  return (
    <button type="button" className="btn btn-primary btn-sm" disabled={!decider}
      data-tip={decider ? "They see it under “Needs from you”, and get an email" : "Add the client's Sponsor or Product owner first (the project chat's details)"}
      onClick={() => act((d, m) => sendRequirementToClient(d, m, r.id), { success: `${r.code} sent to the client to confirm` })}>
      <Send aria-hidden /> {r.confirmed ? "Send to confirm again" : "Send to client"}
    </button>
  );
}
