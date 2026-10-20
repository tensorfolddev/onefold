// node src/server/backup/restore.ts <backup.zip> [--yes] — puts one company back as its own backup (a .zip from its
// Google Drive) has it, touching no other company. For platform operators: it needs DATABASE_ADMIN_URL, so it runs
// on the server (deploy/restore-company.sh). It shows what's in the backup and asks for the company's name first.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { readBackup, restoreCompany } from "./companyBackup.ts";

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node src/server/backup/restore.ts <backup.zip> [--yes]");
  process.exit(2);
}
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error("Set DATABASE_ADMIN_URL (deploy/restore-company.sh does)");
  process.exit(2);
}
const bytes = await readFile(file);
const { data } = await readBackup(bytes);
const counts = Object.entries(data.tables).filter(([, rows]) => rows.length).map(([t, rows]) => `${rows.length} ${t}`).join(", ");
console.log(`${data.orgName} (${data.orgId}), backed up ${data.createdAt}:\n  ${counts}`);
if (flag !== "--yes") {
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await ask.question(`This replaces ALL of ${data.orgName}'s data with this backup — no other company is touched.\nType ${data.orgName} to go on: `);
  ask.close();
  if (answer.trim() !== data.orgName) {
    console.log("Nothing was changed.");
    process.exit(1);
  }
}
const done = await restoreCompany(bytes, { adminUrl });
console.log(`Restored ${data.orgName}: ${done.rows} rows and ${done.files} files. Its people are still signed in; anyone whose login was gone sets a password with "Forgot password".`);
