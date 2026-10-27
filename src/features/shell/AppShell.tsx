"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import {
  Bell, BookOpen, Camera, Check, Home, KeyRound, LayoutGrid, ListChecks, LogOut, Menu, Moon, Plug,
  Settings, Sun, SunMoon, UserCog, Users, Volume2, VolumeX, type LucideIcon,
} from "lucide-react";
import { isSoundOn } from "@/features/tickets/sounds";
import { SoundSettings } from "./SoundSettings";
import { PhotoDialog } from "@/features/people/PhotoDialog";
import { AppStateProvider, useAppState } from "@/features/shell/state";
import { THEMES } from "@/features/shell/themes";
import { useAuth, useMe } from "@/data/StoreProvider";
import type { Panel } from "@/domain/types";
import { Avatar, EnvBadge, Tooltip } from "@/ui/primitives";
import { Popover } from "@/ui/Popover";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProductsSidebar } from "./ProductsSidebar";
import { TicketPanelHost } from "@/features/tickets/TicketPanel";
import { GlobalSearch } from "@/features/shell/GlobalSearch";
import { useDocPrefetch } from "@/features/docs/useDocPrefetch";

interface NavItem { path: string; label: string; icon: LucideIcon }

/** Each panel's own navigation (paths are relative to /admin, /manager or /dev). */
const NAV: Record<Panel, NavItem[]> = {
  admin: [
    { path: "", label: "Home", icon: Home },
    { path: "/products", label: "Products", icon: LayoutGrid },
    { path: "/docs", label: "Docs", icon: BookOpen },
    { path: "/vault", label: "Vault", icon: KeyRound },
    { path: "/people", label: "People", icon: UserCog },
    { path: "/teams", label: "Teams", icon: Users },
    { path: "/settings", label: "Settings", icon: Settings },
  ],
  manager: [
    { path: "", label: "Home", icon: Home },
    { path: "/my-work", label: "My Work", icon: ListChecks },
    { path: "/products", label: "Products", icon: LayoutGrid },
    { path: "/docs", label: "Docs", icon: BookOpen },
    { path: "/vault", label: "Vault", icon: KeyRound },
    { path: "/teams", label: "Team", icon: Users },
  ],
  developer: [
    { path: "", label: "My Work", icon: ListChecks },
    { path: "/products", label: "Products", icon: LayoutGrid },
    { path: "/docs", label: "Docs", icon: BookOpen },
    { path: "/vault", label: "Vault", icon: KeyRound },
  ],
};

export const PANEL_LABEL: Record<Panel, string> = { admin: "Admin", manager: "Manager", developer: "Developer" };

/** Path inside the panel: "/dev/products/AP" → "/products/AP", "/dev" → "". */
const panelPath = (pathname: string) => pathname.replace(/^\/[^/]+/, "");
const isActive = (rel: string, path: string) => (path === "" ? rel === "" : rel.startsWith(path));

/** Waits for a signed-in person (the store fixes stale sessions), then renders that panel's shell. */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const { ready, signedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // The cookie said signed in, but this browser doesn't have that company (cleared storage): sign in again.
  useEffect(() => { if (ready && !signedIn) router.replace(`/signin?next=${encodeURIComponent(pathname)}`); }, [ready, signedIn, router, pathname]);
  if (!signedIn) return <div className="app-loading" aria-busy="true" />;
  return <AppStateProvider><AppShell>{children}</AppShell></AppStateProvider>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useDocPrefetch();
  const pathname = usePathname();
  const hasSidebar = panelPath(pathname).startsWith("/products");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`app${hasSidebar ? "" : " no-sidebar"}${sidebarOpen ? " sidebar-open" : ""}`}>
      <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
      <Rail pathname={pathname} />
      {hasSidebar && <ProductsSidebar rel={panelPath(pathname)} onNavigate={() => setSidebarOpen(false)} />}
      <main className="work-area" id="main">{children}</main>
      <NotificationsPanel />
      <TicketPanelHost />
    </div>
  );
}

export function BrandMark() {
  // 1Fold's own mark: a folded sheet (not monday's logo).
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden>
      <rect x="3" y="3" width="22" height="22" rx="6" fill="var(--primary-color)" />
      <path d="M17 3h2a6 6 0 0 1 6 6v2l-8-8Z" fill="var(--primary-selected-color)" />
      <path d="M11.5 20V9.2L9 10.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M15.5 20v-9.5h4.5M15.5 15h3.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { notificationsOpen, setNotificationsOpen } = useAppState();
  const pathname = usePathname();
  const { db, me, href } = useMe();
  const unread = db.notifications.filter((n) => n.personId === me.id && !n.read).length;
  return (
    <header className="app-topbar">
      <button type="button" className="btn btn-tertiary btn-icon sidebar-toggle" aria-label="Toggle products sidebar" onClick={onToggleSidebar}>
        <Menu />
      </button>
      <Link href={href("")} className="brand" aria-label="1Fold home">
        <BrandMark />
        <span>1Fold</span>
      </Link>
      <EnvBadge />
      <div className="topbar-center">
        <GlobalSearch />
      </div>
      <div className="topbar-actions">
        <Tooltip label="Integrations">
          <Link href={href("/integrations")} className={`topbar-icon${panelPath(pathname) === "/integrations" ? " is-open" : ""}`} aria-label="Integrations">
            <Plug />
          </Link>
        </Tooltip>
        <Tooltip label="Notifications">
          <button
            type="button"
            className={`topbar-icon${notificationsOpen ? " is-open" : ""}`}
            aria-label={`Notifications, ${unread} unread`}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <Bell />
            {unread > 0 && <span className="count-badge">{unread}</span>}
          </button>
        </Tooltip>
        <span className="topbar-divider hide-mobile" />
        <UserMenu />
      </div>
    </header>
  );
}


function UserMenu() {
  const { theme, setTheme } = useAppState();
  const { db, me, panel, signOut } = useMe();
  const [sounds, setSounds] = useState(false);
  const [photo, setPhoto] = useState(false);
  return (
    <>
    {sounds && <SoundSettings onClose={() => setSounds(false)} />}
    {photo && <PhotoDialog personId={me.id} onClose={() => setPhoto(false)} />}
    <Popover
      align="right"
      width={260}
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label="Account menu" style={{ display: "inline-flex" }}>
          <Avatar personId={me.id} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 8px 12px" }}>
            <button type="button" className="menu-photo" aria-label="Change your photo" onClick={() => { close(); setPhoto(true); }}>
              <Avatar personId={me.id} size="lg" />
            </button>
            <div>
              <div style={{ fontWeight: 500 }}>{me.name}</div>
              <div className="muted label">{me.role} · {db.org.name}</div>
              <span className="chip sm panel-badge" data-panel={panel}>{PANEL_LABEL[panel]}</span>
            </div>
          </div>
          <div className="menu-divider" />
          {[false, true].map((dark) => (
            <Fragment key={String(dark)}>
              <div className="menu-section-label">{dark ? "Dark themes" : "Light themes"}</div>
              {THEMES.filter((t) => t.dark === dark).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`menu-item${theme === t.id ? " is-selected" : ""}`}
                  role="menuitemradio"
                  aria-checked={theme === t.id}
                  onClick={() => { setTheme(t.id); close(); }}
                >
                  {t.id === "night" ? <SunMoon /> : dark ? <Moon /> : <Sun />}
                  {t.label}
                  {theme === t.id && <Check className="menu-item-end" />}
                </button>
              ))}
            </Fragment>
          ))}
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={() => { close(); setPhoto(true); }}>
            <Camera /> Change photo
          </button>
          <button type="button" className="menu-item" onClick={() => { close(); setSounds(true); }}>
            {isSoundOn() ? <Volume2 /> : <VolumeX />} Notifications &amp; sounds
          </button>
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={() => { close(); signOut(); }}>
            <LogOut /> Sign out
          </button>
        </>
      )}
    </Popover>
    </>
  );
}

function Rail({ pathname }: { pathname: string }) {
  const { panel, href } = useMe();
  const rel = panelPath(pathname);
  return (
    <nav className="app-rail" aria-label="Main">
      {NAV[panel].map(({ path, label, icon: Icon }) => {
        const active = isActive(rel, path);
        return (
          <Link key={path} href={href(path)} className={`rail-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="rail-icon"><Icon /></span>
            <span className="rail-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
