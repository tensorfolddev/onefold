// Ticket images: what counts as an image (by its bytes), uploads, who may see them, and cleanup that respects Undo.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptInvitation, readSession, signUpCompany, type SessionRow } from "./accounts.ts";
import { applySteps, createInvites, undoLast, viewFor } from "./changes.ts";
import { checkUpload, cleanupFiles, inspectImage, readImage, uploadImage } from "./files.ts";
import { freshDatabase } from "./testing/db.ts";

const dir = await mkdtemp(join(tmpdir(), "onefold-files-"));
process.env.FILES_DIR = dir;

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); await rm(dir, { recursive: true, force: true }); });

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const GIF_1x1 = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const WEBP_1x1 = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
// SOI, an APP0 segment, then a baseline frame header: 2 px high, 3 px wide.
const JPEG_3x2 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);

test("an image is what its bytes say, never its name: PNG, JPEG, WebP and GIF only", () => {
  assert.deepEqual(inspectImage(PNG_1x1), { type: "image/png", width: 1, height: 1 });
  assert.deepEqual(inspectImage(GIF_1x1), { type: "image/gif", width: 1, height: 1 });
  assert.deepEqual(inspectImage(WEBP_1x1), { type: "image/webp", width: 1, height: 1 });
  assert.deepEqual(inspectImage(JPEG_3x2), { type: "image/jpeg", width: 3, height: 2 });
  assert.equal(inspectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")), null);
  assert.equal(inspectImage(Buffer.from("%PDF-1.7")), null);
  assert.equal(inspectImage(PNG_1x1.subarray(0, 12)), null); // cut short
  const huge = Buffer.from(PNG_1x1);
  huge.writeUInt32BE(1_000_000, 16);
  assert.equal(inspectImage(huge), null);
});

let admin: SessionRow;
let dev: SessionRow;
let devPersonId = "";
const ticketImages = async (who: SessionRow) => (await viewFor(who)).db.tickets.find((t) => t.key === "CH-1")?.attachments ?? [];
const filesOnDisk = async () => (await readdir(join(dir, admin.orgId)).catch(() => [] as string[])).sort();

test("an upload lands on the ticket with the server's own idea of its type and size, and on disk", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: "Correct-Horse-42", company: "Acme", slug: "acme-files" });
  admin = (await readSession(founder.token))!;
  const me = founder.personId;
  await applySteps(admin, [
    { name: "createProduct", args: [{ key: "CH", name: "Checkout", type: "internal", pmId: me, projectManagerId: me }] },
    { name: "createTicket", args: ["CH", "Build the cart"] },
  ]);
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], "https://1fold.test");
  const joined = await acceptInvitation(invites[0].link.split("/invite/")[1], { name: "Sam Dev", password: "Correct-Horse-42" });
  dev = (await readSession(joined.token))!;
  devPersonId = joined.personId;

  const { id } = await uploadImage(admin, { ticketKey: "CH-1", name: "cart/../design.png" }, PNG_1x1);
  const [att] = await ticketImages(admin);
  assert.deepEqual([att.id, att.name, att.type, att.size, att.width, att.height], [id, "cart..design.png", "image/png", PNG_1x1.length, 1, 1]);
  assert.deepEqual(await filesOnDisk(), [id]);
  assert.deepEqual((await readImage(admin, id))?.bytes, PNG_1x1);
});

test("refused uploads leave nothing behind; browsers can't add an image without uploading it", async () => {
  await assert.rejects(uploadImage(admin, { ticketKey: "CH-1", name: "x.png" }, Buffer.from("not an image")), /Only PNG, JPG, WebP or GIF/);
  await assert.rejects(uploadImage(admin, { ticketKey: "CH-404", name: "x.png" }, PNG_1x1));
  await assert.rejects(uploadImage(dev, { ticketKey: "CH-1", name: "x.png" }, PNG_1x1)); // not on that product
  await assert.rejects(checkUpload(dev, "CH-1")); // …refused before the bytes are even read
  await assert.rejects(checkUpload(admin, "CH-404"));
  await checkUpload(admin, "CH-1");
  assert.equal((await filesOnDisk()).length, 1);
  await assert.rejects(applySteps(admin, [{ name: "addAttachment", args: ["CH-1", { id: "fake", name: "x", type: "image/png", size: 1, width: 1, height: 1 }] }]), /isn't allowed/);
});

test("only people who can see the ticket can open its images", async () => {
  const [att] = await ticketImages(admin);
  assert.equal(await readImage(dev, att.id), null); // Sam isn't on Checkout yet
  await applySteps(admin, [{ name: "setMember", args: ["CH", devPersonId, true] }]);
  assert.deepEqual((await readImage(dev, att.id))?.bytes, PNG_1x1);
  assert.equal(await readImage(admin, "../../etc/passwd"), null);
  assert.equal(await readImage(admin, "img-unknown"), null);
});

test("cleanup keeps what a ticket or an Undo still needs, and removes the rest", async () => {
  const later = Date.now() + 2 * 60 * 60_000; // past the grace period for fresh uploads
  const [att] = await ticketImages(admin);
  await applySteps(admin, [{ name: "removeAttachment", args: ["CH-1", att.id] }], { undoable: true });
  assert.equal(await readImage(admin, att.id), null); // no longer on a ticket
  assert.equal(await cleanupFiles(later), 0); // but Undo could bring it back
  await undoLast(admin);
  assert.deepEqual((await readImage(admin, att.id))?.bytes, PNG_1x1);

  await applySteps(admin, [{ name: "removeAttachment", args: ["CH-1", att.id] }]); // not undoable: nothing needs it now
  assert.equal(await cleanupFiles(Date.now()), 0); // too fresh — it might belong to an upload still finishing
  assert.equal(await cleanupFiles(later), 1);
  assert.deepEqual(await filesOnDisk(), []);
});

test("a profile photo: your own (anyone's, for an admin) — the whole company sees it, cleanup keeps it", async () => {
  const { uploadAvatar } = await import("./files.ts");
  const { AccessError } = await import("../domain/commands/index.ts");
  const adminId = (await viewFor(admin)).db.people.find((p) => p.panel === "admin")!.id;
  const later = Date.now() + 2 * 60 * 60_000;
  await assert.rejects(uploadAvatar(dev, adminId, PNG_1x1), AccessError); // not someone else's
  await assert.rejects(uploadAvatar(dev, devPersonId, Buffer.from("not an image")), /Only PNG, JPG, WebP or GIF/);
  const { id } = await uploadAvatar(dev, devPersonId, JPEG_3x2);
  assert.equal((await viewFor(admin)).db.people.find((p) => p.id === devPersonId)?.photo, `file:${id}`);
  assert.deepEqual((await readImage(admin, id))?.bytes, JPEG_3x2); // anyone in the company sees it
  assert.equal(await cleanupFiles(later), 0); // in use

  // A template by command; an uploaded photo only through the upload (a command can't point at any image).
  await applySteps(admin, [{ name: "setPhoto", args: [devPersonId, "tpl:fox"] }]); // an admin, for someone else
  assert.equal((await viewFor(dev)).db.people.find((p) => p.id === devPersonId)?.photo, "tpl:fox");
  await assert.rejects(applySteps(dev, [{ name: "setPhoto", args: [devPersonId, `file:${id}`] }]), /Pick a photo/);
  assert.equal(await readImage(admin, id), null); // not anyone's photo now
  assert.equal(await cleanupFiles(later), 1); // so the old upload goes
});
