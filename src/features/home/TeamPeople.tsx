"use client";

import { bookedH, isBlocked, isOpen, loadColor, membersOf } from "@/domain/selectors/dashboard";
import { useMe } from "@/data/StoreProvider";
import type { TeamId } from "@/domain/types";
import { Avatar, Progress } from "@/ui/primitives";

/** People table for one team (monday Collaborators layout). Ticket counts read live state. */
export function TeamPeople({ team }: { team: TeamId }) {
  const { db } = useMe();
  const { tickets } = db;
  return (
    <table className="dash-table people-table">
      <thead>
        <tr>
          <th scope="col">Person</th>
          <th scope="col">Role</th>
          <th scope="col">Booked / Capacity</th>
          <th scope="col">Open tickets</th>
          <th scope="col">Blocked</th>
        </tr>
      </thead>
      <tbody>
        {membersOf(db, team).map((p) => {
          const mine = tickets.filter((t) => t.assigneeIds?.includes(p.id));
          const booked = bookedH(db, p.id);
          const pct = p.capacityH ? Math.round((booked / p.capacityH) * 100) : 0;
          const blocked = mine.filter((t) => isBlocked(db, t)).length;
          return (
            <tr key={p.id} className="dash-row">
              <th scope="row" className="dash-name"><span className="dash-person"><Avatar personId={p.id} />{p.name}</span></th>
              <td data-label="Role">{p.role}</td>
              <td data-label="Booked / Capacity">
                <span className="dash-metric">
                  <Progress pct={pct} color={loadColor(pct)} />
                  <span className="meter-value">{booked}h / {p.capacityH}h</span>
                </span>
              </td>
              <td data-label="Open tickets">{mine.filter((t) => isOpen(db, t)).length}</td>
              <td data-label="Blocked">
                {blocked ? <span className="dash-blocked">{blocked}</span> : <span className="dash-muted">0</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
