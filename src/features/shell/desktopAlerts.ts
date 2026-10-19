// Desktop alerts: when 1Fold is open but you're in another tab or app, a new notice also pops up as a system
// notification. Needs the browser's permission (asked once, from a click); can be switched off per browser.
const KEY = "onefold.desktop";

export const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;

export function desktopOn(): boolean {
  if (!desktopSupported() || Notification.permission !== "granted") return false;
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

/** Asks the browser (the first time), then turns alerts on or off for this browser. */
export async function setDesktop(on: boolean): Promise<boolean> {
  if (!desktopSupported()) return false;
  if (on && Notification.permission === "default") await Notification.requestPermission();
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: as the permission says */ }
  return desktopOn();
}

/** Shows one alert, if you're away from this tab and alerts are on. A click brings 1Fold back and opens it. */
export function alertDesktop(title: string, body: string, tag: string, onOpen: () => void) {
  if (!desktopOn() || (document.visibilityState === "visible" && document.hasFocus())) return;
  try {
    const n = new Notification(title, { body, tag, icon: "/favicon.ico" });
    n.onclick = () => { window.focus(); onOpen(); n.close(); };
  } catch { /* some browsers only allow alerts from a service worker: the sound and badge still tell */ }
}
