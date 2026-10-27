// The colour themes: each is the light, dark or night base (whose component rules it keeps) plus, for the extra ones,
// a class that repaints the palette (styles/themes.css). The choice is saved in this browser, and applied before the
// first paint by a tiny script in the root layout, so a dark theme never flashes light on a refresh.
export type Theme = "light" | "solarized-light" | "bluloco-light" | "dark" | "solarized-dark" | "slack" | "night";

export const THEMES: { id: Theme; label: string; dark: boolean; classes: string }[] = [
  { id: "light", label: "Light", dark: false, classes: "light-app-theme" },
  { id: "solarized-light", label: "Solarized Light", dark: false, classes: "light-app-theme theme-solarized-light" },
  { id: "bluloco-light", label: "Bluloco Light", dark: false, classes: "light-app-theme theme-bluloco-light" },
  { id: "dark", label: "Dark", dark: true, classes: "dark-app-theme" },
  { id: "solarized-dark", label: "Solarized Dark", dark: true, classes: "dark-app-theme theme-solarized-dark" },
  { id: "slack", label: "Slack", dark: true, classes: "dark-app-theme theme-slack" },
  { id: "night", label: "Night", dark: true, classes: "black-app-theme" },
];

export const THEME_KEY = "onefold.theme";
export const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.id === v);
export const themeClasses = (t: Theme) => THEMES.find((x) => x.id === t)!.classes;

/** The theme saved in this browser ("light" if none). In the browser only: the theme menus never render on the server. */
export function savedTheme(): Theme {
  try { const t = typeof window === "undefined" ? null : localStorage.getItem(THEME_KEY); return isTheme(t) ? t : "light"; } catch { return "light"; }
}
/** Paints a theme now and keeps it for the next visit — the team's app and the client space alike. */
export function applyTheme(t: Theme) {
  document.body.className = themeClasses(t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private window: this visit only */ }
}

/** Runs as the body's first child, before anything paints: the saved theme's classes on <body>. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)}),m=${JSON.stringify(
  Object.fromEntries(THEMES.map((t) => [t.id, t.classes])),
)};if(t&&m[t])document.body.className=m[t]}catch(e){}`;
