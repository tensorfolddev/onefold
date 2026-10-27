// The vault's "forgot my master password" (server/vault.ts) — a teammate's session only:
//   POST /api/vault/forgot                 — email me a reset link (30 minutes, once)
//   POST /api/vault/check   { token }      — is this link still good, and mine?
//   POST /api/vault/recover { token, wrap } — use it: my private key, locked again with a new master password
// Everything else in the vault is ordinary company changes (/api/org/changes), all ciphertext.
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { appUrl, handle, ok, readBody, refuse, requireSession } from "@/server/http";
import { recoverVault, sendVaultReset, vaultResetCheck } from "@/server/vault";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/vault/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    if (action === "forgot") {
      limit(`vault-forgot:${who.userId}`, 3, 15 * MINUTE); // nobody's inbox gets flooded
      await sendVaultReset(who, appUrl(req));
      return ok({});
    }
    if (action === "check") {
      limit(`vault-check:${who.userId}`, 30, 15 * MINUTE);
      const b = await readBody(req, 4 * 1024);
      return ok(await vaultResetCheck(who, b.token));
    }
    if (action === "recover") {
      limit(`vault-recover:${who.userId}`, 10, 15 * MINUTE);
      const b = await readBody(req, 16 * 1024);
      return ok(await recoverVault(who, b.token, b.wrap as Parameters<typeof recoverVault>[2]));
    }
    return refuse("Not found", 404);
  });
}
