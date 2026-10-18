"use client";

// WhatsApp in the app. Each person links their own number for the daily brief (account menu → WhatsApp): 1Fold
// gives them a one-time code, they send it to the bot, done. Platform admins pair the environment's bot in Settings,
// by scanning a QR from the bot's own phone.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, MessageCircle, Smartphone, Unlink, X } from "lucide-react";
import { api, ApiError } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { IconButton } from "@/ui/primitives";

type BotState = "off" | "pairing" | "connecting" | "connected" | "logged_out";
interface MyWhatsApp { available: boolean; linked: { phone: string; briefs: boolean; linkedAt: string } | null }
interface BotStatus { state: BotState; qr: string | null; phone: string | null; request: string | null; updatedAt: string }
interface Status { me: MyWhatsApp; bot: BotStatus | null }
interface LinkCode { code: string; url: string; botPhone: string; expiresAt: string }

const problemOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — please try again");
const shownPhone = (digits: string | null) => (digits ? `+${digits}` : "your WhatsApp");

/** The WhatsApp status from the server, checked again every `everyMs`. */
function useWhatsApp(everyMs: number) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/whatsapp/status"));
      setError(null);
    } catch (e) {
      setError(problemOf(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch; state is set when the server answers
    void load();
    const timer = setInterval(() => void load(), everyMs);
    return () => clearInterval(timer);
  }, [everyMs, load]);
  return { status, error, reload: load };
}

/** Account menu → WhatsApp: link your number (or unlink it, to change numbers). Render only while open. */
export function WhatsAppDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState<LinkCode | null>(null);
  const [busy, setBusy] = useState(false);
  const { status, error, reload } = useWhatsApp(code ? 3000 : 20_000); // waiting for their message: check often

  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      if (done) toast(done);
    } catch (e) {
      toast(problemOf(e));
    } finally {
      setBusy(false);
    }
  };

  const linked = status?.me.linked ?? null;
  let body: React.ReactNode;
  if (!status) {
    body = error ? <p className="tpl-empty">{error}</p> : <div className="auth-loading" aria-busy="true"><span className="auth-spinner" /> Loading…</div>;
  } else if (linked) {
    body = (
      <>
        <p className="wa-linked"><Check aria-hidden /> Connected to <strong>{shownPhone(linked.phone)}</strong></p>
        <p className="muted">Every working day at 9:00 you get your pending tasks here, project by project. Reply <strong>1FOLD</strong> to the bot anytime for an update.</p>
        <div className="inv-foot">
          <button type="button" className="btn btn-tertiary is-danger" disabled={busy}
            onClick={() => void run(async () => { await api("/api/whatsapp/unlink", {}); setCode(null); }, "WhatsApp disconnected")}>
            <Unlink aria-hidden /> Disconnect
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </>
    );
  } else if (!status.me.available) {
    body = (
      <p className="auth-note"><Smartphone aria-hidden />
        <span>1Fold&apos;s WhatsApp isn&apos;t connected right now, so there&apos;s nothing to link to yet. Your admin can connect it in <strong>Settings → WhatsApp</strong>.</span>
      </p>
    );
  } else if (code) {
    body = (
      <>
        <ol className="wa-steps">
          <li>
            <a className="btn btn-primary" href={code.url} target="_blank" rel="noreferrer noopener"><MessageCircle aria-hidden /> Open WhatsApp</a>
            <span className="muted">It opens a chat with 1Fold with your code already typed — just press send.</span>
          </li>
          <li>Or send <code className="wa-code">{code.code}</code> to <strong>{shownPhone(code.botPhone)}</strong> yourself.</li>
        </ol>
        <p className="auth-loading" aria-live="polite"><span className="auth-spinner" aria-hidden /> Waiting for your message… (the code works for 15 minutes)</p>
      </>
    );
  } else {
    body = (
      <>
        <p className="muted">Get your pending tasks on WhatsApp every working day at 9:00, project by project, with due dates and links. You send the first message, so 1Fold only ever writes to you.</p>
        <div className="inv-foot">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Not now</button>
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={() => void run(async () => setCode(await api<LinkCode>("/api/whatsapp/connect", {})))}>
            <MessageCircle aria-hidden /> Connect WhatsApp
          </button>
        </div>
      </>
    );
  }

  return (
    <dialog ref={ref} className="pf-dialog wa-dialog" aria-labelledby="wa-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="pf-dialog-head">
        <div>
          <h2 id="wa-title" className="pf-dialog-title">WhatsApp</h2>
          <p className="muted">Your daily brief from 1Fold</p>
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="inv-body">{body}</div>
    </dialog>
  );
}

function PairingQr({ text }: { text: string }) {
  const [src, setSrc] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((qr) => qr.default.toDataURL(text, { margin: 1, width: 256 }))
      .then((url) => { if (live) setSrc({ text, url }); })
      .catch(() => {});
    return () => { live = false; };
  }, [text]);
  return src?.text === text
    // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL
    ? <img className="wa-qr" src={src.url} width={256} height={256} alt="QR code to link the bot's WhatsApp" />
    : <div className="wa-qr is-loading" aria-busy="true" />;
}

const BOT_STATE: Record<BotState, string> = {
  off: "Not connected",
  pairing: "Waiting for the scan",
  connecting: "Connecting…",
  connected: "Connected",
  logged_out: "Disconnected — scan again",
};

/** Settings → WhatsApp: the environment's bot. Only platform admins (PLATFORM_ADMIN_EMAILS) see it. */
export function WhatsAppBotSettings() {
  const { toast } = useMe();
  const [fast, setFast] = useState(false);
  const { status, reload } = useWhatsApp(fast ? 2000 : 30_000);
  const bot = status?.bot ?? null;
  const busy = !!bot && (!!bot.request || bot.state === "pairing" || bot.state === "connecting");
  useEffect(() => { setFast(busy); }, [busy]); // eslint-disable-line react-hooks/set-state-in-effect -- polling speed follows the server's state
  if (!bot) return null;

  const ask = async (request: "pair" | "logout") => {
    try {
      await api(`/api/whatsapp/${request}`, {});
      setFast(true);
      await reload();
    } catch (e) {
      toast(problemOf(e));
    }
  };

  return (
    <section className="admin-teams" aria-labelledby="wa-bot-title">
      <header className="team-header">
        <h2 id="wa-bot-title" className="team-title">WhatsApp</h2>
        <span className="chip sm wa-state" data-state={bot.state}>{BOT_STATE[bot.state]}</span>
      </header>
      <p className="muted wa-intro">
        The number 1Fold sends daily briefs from — use a dedicated SIM, not a personal number. This environment has its own.
      </p>
      {bot.request ? (
        <p className="auth-loading"><span className="auth-spinner" aria-hidden /> Waiting for the worker to {bot.request === "pair" ? "start pairing" : "log out"}…</p>
      ) : bot.state === "pairing" && bot.qr ? (
        <div className="wa-pairing">
          <PairingQr text={bot.qr} />
          <ol className="wa-steps">
            <li>On the bot&apos;s phone, open WhatsApp → <strong>Settings → Linked devices → Link a device</strong>.</li>
            <li>Scan this code. It changes about every 20 seconds — this page keeps up.</li>
          </ol>
        </div>
      ) : bot.state === "connected" ? (
        <div className="inv-foot wa-foot">
          <span className="wa-linked"><Check aria-hidden /> Sending from <strong>{shownPhone(bot.phone)}</strong></span>
          <button type="button" className="btn btn-tertiary is-danger" onClick={() => void ask("logout")}><Unlink aria-hidden /> Disconnect</button>
        </div>
      ) : bot.state === "connecting" ? null : (
        <div className="inv-foot wa-foot">
          {bot.state === "logged_out" && <span className="auth-error">WhatsApp logged the bot out. Until it&apos;s scanned again, briefs go by email.</span>}
          <button type="button" className="btn btn-primary" onClick={() => void ask("pair")}><ExternalLink aria-hidden /> Connect the bot</button>
        </div>
      )}
    </section>
  );
}
