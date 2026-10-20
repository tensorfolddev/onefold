"use client";

// Settings pages (a project's, the company's): a menu on the side that jumps between sections and follows you as you
// scroll, and each section with its title and a line on what it's for.
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface SettingsSection { id: string; label: string; icon: LucideIcon; hint: string; body: React.ReactNode }

export function SettingsLayout({ sections, label = "Settings" }: { sections: SettingsSection[]; label?: string }) {
  const [active, setActive] = useState(sections[0]?.id);
  const root = useRef<HTMLDivElement>(null);
  const ids = sections.map((s) => s.id).join(" ");
  useEffect(() => {
    const all = ids.split(" ");
    const seen = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-10% 0px -70% 0px" });
    all.forEach((id) => { const el = document.getElementById(id); if (el) seen.observe(el); });
    // The last section can't scroll up to the top: once whatever holds these settings is scrolled to the end, it's that one.
    const atEnd = (e: Event) => {
      const box = e.target instanceof Element ? e.target : document.scrollingElement;
      if (box && root.current && box.contains(root.current) && box.scrollTop + box.clientHeight >= box.scrollHeight - 2) setActive(all[all.length - 1]);
    };
    document.addEventListener("scroll", atEnd, { capture: true, passive: true });
    return () => { seen.disconnect(); document.removeEventListener("scroll", atEnd, { capture: true }); };
  }, [ids]);
  const go = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="settings" ref={root}>
      <nav className="settings-nav" aria-label={label}>
        {sections.map(({ id, label: name, icon: Icon }) => (
          <button key={id} type="button" className="settings-nav-item" aria-current={active === id ? "true" : undefined} onClick={() => go(id)}>
            <Icon aria-hidden /> {name}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {sections.map(({ id, label: name, hint, body }) => (
          <section key={id} id={id} className="settings-section" aria-labelledby={`${id}-title`}>
            <header className="settings-section-head"><h2 id={`${id}-title`}>{name}</h2><p>{hint}</p></header>
            {body}
          </section>
        ))}
      </div>
    </div>
  );
}
