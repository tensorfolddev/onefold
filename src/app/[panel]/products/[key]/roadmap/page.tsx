"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { productMilestones } from "@/domain/selectors/product";
import { useMe } from "@/data/StoreProvider";
import { RoadmapTimeline } from "@/features/products/RoadmapTimeline";
import { MilestoneForm } from "@/features/products/MilestoneForm";
import type { Milestone } from "@/domain/types";

export default function ProductRoadmap() {
  const { key } = useParams<{ key: string }>();
  const { db, can, productByKey } = useMe();
  const canEdit = can("milestone.edit", { product: productByKey(key) });
  // null = closed, "new" = adding, a milestone = editing it
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const close = () => setEditing(null);

  return (
    <section aria-labelledby="roadmap-heading">
      <div className="toolbar">
        <h2 id="roadmap-heading" className="section-title">Roadmap · Sep – Dec 2026</h2>
        <span className="spacer" />
        {canEdit && !editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> Add milestone
          </button>
        )}
      </div>
      {editing && (
        <MilestoneForm key={editing === "new" ? "new" : editing.id} productKey={key}
          milestone={editing === "new" ? undefined : editing} onClose={close} />
      )}
      <RoadmapTimeline milestones={productMilestones(db, key)} onEdit={canEdit ? setEditing : undefined} />
    </section>
  );
}
