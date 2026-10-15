/** Dashboard widget card: 49px header with 18/500 title, white body, 1px layout border, 8px radius. */
export function Widget({
  title, actions, className = "", children,
}: {
  title: string; actions?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  const id = `w-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={`widget ${className}`} aria-labelledby={id}>
      <header className="widget-header">
        <h2 id={id} className="widget-title">{title}</h2>
        {actions}
      </header>
      <div className="widget-body">{children}</div>
    </section>
  );
}

/** monday "number" widget: one big centred figure + a muted caption. */
export function KpiTile({ title, value, caption, tone }: { title: string; value: string; caption?: string; tone?: string }) {
  return (
    <Widget title={title} className="kpi-widget">
      <p className="kpi-number" style={tone ? { color: tone } : undefined}>{value}</p>
      {caption && <p className="kpi-caption">{caption}</p>}
    </Widget>
  );
}
