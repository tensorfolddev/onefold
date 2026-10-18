// POST /api/docs  { title, productKey?, parentId?, template?, icon?, body? }  — a new doc (and its first body)
import type { NextRequest } from "next/server";
import { createDoc, MAX_BODY_CHARS } from "@/server/docs";
import { handle, ok, readBody, requireSession, str } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    const who = await requireSession(req);
    const b = await readBody(req, MAX_BODY_CHARS * 4);
    return ok(await createDoc(who, {
      title: str(b.title, 300), productKey: str(b.productKey, 20) || undefined, parentId: str(b.parentId, 100) || undefined,
      template: str(b.template, 40) || undefined, icon: str(b.icon, 16) || undefined,
      body: typeof b.body === "string" ? b.body : undefined,
    }));
  });
}
