// `npm run db:generate` turns schema changes into a new numbered migration in drizzle/. Migrations are permanent:
// never edit one after it has been released (design §12). Applying them is `npm run db:migrate` (src/server/db/migrate.ts).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  strict: true,
});
