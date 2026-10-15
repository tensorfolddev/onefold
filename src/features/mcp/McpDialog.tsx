"use client";

// Account menu → Claude & MCP: personal API tokens for Claude Code (or any MCP client). A new token is shown once,
// with the one command that connects Claude to 1Fold; it can do what you can, and stops when you revoke it.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import { IconButton } from "@/ui/primitives";

interface TokenInfo { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null }
const problemOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — please try again");

export function McpDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [name, setName] = useState("Claude Code");
  const [made, setMade] = useState<(TokenInfo & { token: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setTokens((await api<{ tokens: TokenInfo[] }>("/api/tokens/list")).tokens); } catch (e) { toast(problemOf(e)); }
  }, [toast]);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch; state is set when the server answers
    void load();
    return () => d?.close();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setMade(await api<TokenInfo & { token: string }>("/api/tokens/create", { name }));
      setCopied(false);
      await load();
    } catch (problem) {
      toast(problemOf(problem));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (t: TokenInfo) => {
    try {
      await api("/api/tokens/revoke", { id: t.id });
      if (made?.id === t.id) setMade(null);
      toast(`"${t.name}" can't connect any more`);
      await load();
    } catch (e) {
      toast(problemOf(e));
    }
  };

  const command = made
    ? `claude mcp add --transport http onefold ${window.location.origin}/api/mcp --header "Authorization: Bearer ${made.token}"`
    : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); toast("Copied"); } catch { toast("Couldn't copy — select it instead"); }
  };

  return (
    <dialog ref={ref} className="pf-dialog mcp-dialog" aria-labelledby="mcp-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="pf-dialog-head">
        <div>
          <h2 id="mcp-title" className="pf-dialog-title">Claude &amp; MCP</h2>
          <p className="muted">Let Claude read and update your tickets — as you, with your permissions.</p>
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="inv-body">
        {made ? (
          <div className="mcp-made" role="status">
            <p><strong>Token &ldquo;{made.name}&rdquo; is ready.</strong> Run this once in a terminal to connect Claude Code — for security, the token isn&apos;t shown again.</p>
            <code className="mcp-command">{command}</code>
            <div className="inv-foot wa-foot">
              <button type="button" className="btn btn-primary" onClick={copy}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy command"}</button>
              <button type="button" className="btn btn-tertiary" onClick={() => setMade(null)}>Done</button>
            </div>
          </div>
        ) : (
          <form className="admin-inline-form mcp-form" onSubmit={create} noValidate>
            <label className="input mcp-name">
              <input value={name} maxLength={80} aria-label="Token name" placeholder="e.g. Claude Code on my laptop" onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}><Plus aria-hidden /> Create token</button>
          </form>
        )}
        <section aria-labelledby="mcp-tokens">
          <h3 id="mcp-tokens" className="mcp-heading">Your tokens</h3>
          {tokens === null ? <p className="muted">Loading…</p> : tokens.length === 0 ? <p className="muted">None yet.</p> : (
            <ul className="mcp-tokens">
              {tokens.map((t) => (
                <li key={t.id}>
                  <KeyRound aria-hidden />
                  <span className="mcp-token-text">
                    <strong>{t.name}</strong>
                    <span className="muted">…{t.hint} · made {relativeTime(t.createdAt)} · {t.lastUsedAt ? `used ${relativeTime(t.lastUsedAt)}` : "never used"}</span>
                  </span>
                  <button type="button" className="btn btn-tertiary is-danger" onClick={() => void revoke(t)} aria-label={`Revoke ${t.name}`}>
                    <Trash2 aria-hidden /> Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </dialog>
  );
}
