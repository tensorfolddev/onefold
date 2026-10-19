"use client";

import Link from "next/link";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { HEALTH, STAGE_TONE, toneVar } from "@/domain/status";
import type { Health, Product, Stage, Tone } from "@/domain/types";
import { useDb } from "@/data/StoreProvider";

export function Avatar({ personId, size = "md" }: { personId?: string; size?: "sm" | "md" | "lg" }) {
  const { personById } = useDb();
  const p = personById(personId);
  const cls = `avatar ${size === "md" ? "" : size}`;
  if (!p) return <span className={`${cls} empty`} aria-label="Unassigned" title="Unassigned">–</span>;
  return (
    <span className={cls} style={{ background: p.color }} title={p.name} aria-label={p.name}>
      {p.initials}
    </span>
  );
}

/** A tooltip on whatever it wraps — drawn by the app's one tooltip layer (ui/TooltipLayer), so nothing clips it. */
export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return <span className="tooltip-host" data-tip={label}>{children}</span>;
}

/** Icon-only button: always has a tooltip + aria-label (DESIGN.md guardrail). */
export function IconButton({
  label, onClick, children, className = "btn btn-tertiary btn-icon", active,
}: {
  label: string; onClick?: () => void; children: React.ReactNode; className?: string; active?: boolean;
}) {
  return (
    <Tooltip label={label}>
      <button type="button" className={`${className}${active ? " is-open" : ""}`} aria-label={label} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  );
}

export function HealthDot({ health }: { health: Health }) {
  const h = HEALTH[health];
  return (
    <span className="health">
      <span className="health-dot" style={{ "--dot": h.color } as React.CSSProperties} />
      {h.label}
    </span>
  );
}

export function StagePill({ stage }: { stage: Stage }) {
  return <span className="stage-pill" style={{ "--stage": STAGE_TONE[stage] } as React.CSSProperties}>{stage}</span>;
}

export function StatusPill({ name, tone, filled }: { name: string; tone: Tone; filled?: boolean }) {
  return (
    <span className={`status-pill${filled ? " filled" : ""}`} style={{ "--pill-tone": toneVar(tone) } as React.CSSProperties}>
      {name}
    </span>
  );
}

/** Segmented "battery" bar (monday group summary) — segments are {tone, value}. */
export function Battery({ segments, thin, label }: { segments: { tone: Tone; value: number }[]; thin?: boolean; label?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={`battery${thin ? " thin" : ""}`} role="img" aria-label={label}>
      {segments.filter((s) => s.value > 0).map((s, i) => (
        <span key={i} style={{ width: `${(s.value / total) * 100}%`, background: toneVar(s.tone) }} />
      ))}
    </div>
  );
}

export function Progress({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(pct, 100)}%`, "--bar": color } as React.CSSProperties} />
    </div>
  );
}

/** Product tile: its emoji, its icon, or (default) its first letter — on the product's colour. */
export function ProductTile({ product, size }: { product: Product; size?: "lg" | "xl" }) {
  const cls = `product-tile${size ? ` ${size}` : ""}`;
  const style = { background: product.color, "--tile": product.color } as React.CSSProperties;
  if (product.icon?.type === "emoji") {
    return <span className={`${cls} is-emoji`} style={style} aria-hidden>{product.icon.value}</span>;
  }
  if (product.icon?.type === "icon") {
    return (
      <span className={`${cls} is-icon`} style={style} aria-hidden>
        <DynamicIcon name={product.icon.value as IconName} fallback={() => <>{product.name[0]}</>} />
      </span>
    );
  }
  return <span className={cls} style={style} aria-hidden>{product.name[0]}</span>;
}

export interface TabItem {
  label: string;
  href?: string;
  count?: number;
  icon?: React.ReactNode;
}

/** Tabs: links when `href` is given, otherwise buttons driven by `onSelect`. */
export function Tabs({
  items, active, onSelect, ariaLabel,
}: {
  items: TabItem[]; active: string; onSelect?: (label: string) => void; ariaLabel: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((t) => {
        const isActive = t.label === active;
        const inner = (
          <>
            {t.icon}
            {t.label}
            {t.count !== undefined && <span className="tab-count">{t.count}</span>}
            <span className="tab-indicator" />
          </>
        );
        const cls = `tab${isActive ? " is-active" : ""}`;
        return t.href ? (
          <Link key={t.label} href={t.href} className={cls} role="tab" aria-selected={isActive}>{inner}</Link>
        ) : (
          <button key={t.label} type="button" className={cls} role="tab" aria-selected={isActive} onClick={() => onSelect?.(t.label)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Renders "@Full Name" mentions as highlighted chips. */
export function WithMentions({ text }: { text: string }) {
  const parts = text.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?(?: \([^)]+\))?)/g);
  return <>{parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="mention">{p}</span> : p))}</>;
}

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "dev";
/** dev and stg builds say so on every screen, so nobody mistakes them for production. */
export function EnvBadge() {
  if (APP_ENV === "prod") return null;
  return <span className="env-badge" data-env={APP_ENV}>{APP_ENV === "stg" ? "Staging" : "Dev"}</span>;
}
