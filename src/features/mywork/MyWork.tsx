"use client";

import { useState } from "react";
import { CalendarDays, Info, Search, Table2 } from "lucide-react";
import { groupMyWork } from "@/domain/selectors/mywork";
import { useMe } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";
import { Tabs, Tooltip } from "@/ui/primitives";
import { MyWorkTable } from "./MyWorkTable";
import { WeekCalendar } from "./WeekCalendar";

export function MyWork() {
  const { db, me, productByKey } = useMe();
  const { tickets } = useAppState();
  const [view, setView] = useState("Table");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (t: (typeof tickets)[number]) =>
    !q || `${t.key} ${t.title} ${productByKey(t.productKey)?.name ?? ""}`.toLowerCase().includes(q);
  const groups = groupMyWork(db, me.id, tickets).map((g) => ({ ...g, tickets: g.tickets.filter(matches) }));

  return (
    <div className="mw-page">
      <div className="page mw-body">
        <div className="page-header">
          <h1 className="page-title">My Work</h1>
          <Tooltip label="Everything assigned to you across products">
            <span className="mw-info" tabIndex={0} aria-label="About My Work: everything assigned to you across products">
              <Info aria-hidden />
            </span>
          </Tooltip>
        </div>

        <Tabs
          ariaLabel="My Work views"
          active={view}
          onSelect={setView}
          items={[
            { label: "Table", icon: <Table2 aria-hidden /> },
            { label: "Calendar", icon: <CalendarDays aria-hidden /> },
          ]}
        />

        <div className="toolbar mw-toolbar">
          <label className="input mw-search">
            <Search aria-hidden />
            <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search my work" />
          </label>
        </div>

        {view === "Table" ? (
          <MyWorkTable groups={groups} />
        ) : (
          <WeekCalendar tickets={groups.flatMap((g) => g.tickets)} />
        )}
      </div>
    </div>
  );
}
