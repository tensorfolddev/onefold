"use client";

import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, GitPullRequest } from "lucide-react";
import { isOverdue, requirementOf } from "@/domain/selectors/mywork";
import { useAppState } from "@/features/shell/state";
import { formatHours, shortDate } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { ProductTile, Tooltip } from "@/ui/primitives";
import { StatusCell } from "@/ui/StatusCell";
import { EpicChip } from "@/features/tickets/TicketBits";
import { useDb } from "@/data/StoreProvider";

export function WorkRow({ ticket, done }: { ticket: Ticket; done?: boolean }) {
  const { openTicket } = useAppState();
  const { db, productByKey, href } = useDb();
  const product = productByKey(ticket.productKey);
  const req = requirementOf(db, ticket);
  const overdue = isOverdue(db, ticket);

  return (
    <div className="mw-row" role="row">
      <div className="mw-cell mw-cell-name" role="cell">
        <button type="button" className="mw-name" onClick={() => openTicket(ticket.key)}>
          <span className="key">{ticket.key}</span>
          <span className="mw-title">{ticket.title}</span>
        </button>
        <EpicChip ticket={ticket} />
      </div>
      <div className="mw-cell mw-cell-product" role="cell">
        {product && (
          <>
            <ProductTile product={product} />
            <span className="mw-ellipsis">{product.name}</span>
          </>
        )}
      </div>
      <div className="mw-cell mw-num" role="cell" data-label="Est">{formatHours(ticket.estimateH)}</div>
      <div className="mw-cell" role="cell">
        {req && (
          <Tooltip label={`${req.code} · ${req.title}`}>
            <Link href={href(`/products/${ticket.productKey}/docs`)} className="chip sm mw-req" aria-label={`Requirement ${req.code}: ${req.title}`}>
              {req.code}
              <ArrowUpRight aria-hidden />
            </Link>
          </Tooltip>
        )}
      </div>
      <div className="mw-cell mw-cell-status" role="cell">
        <StatusCell ticket={ticket} />
      </div>
      <div className={`mw-cell mw-due${overdue ? " is-overdue" : ""}${done ? " is-done" : ""}`} role="cell" data-label="Due">
        {overdue && <CircleAlert aria-label="Overdue" />}
        {done && <Check aria-hidden />}
        {shortDate(ticket.due) || "—"}
      </div>
      <div className="mw-cell" role="cell">
        {ticket.pr && (
          <span className="chip sm mw-pr" data-state={ticket.pr.state}>
            <GitPullRequest aria-hidden />
            PR #{ticket.pr.number}
            {ticket.pr.state !== "open" && <Check aria-hidden />}
            {ticket.pr.state}
          </span>
        )}
      </div>
    </div>
  );
}
