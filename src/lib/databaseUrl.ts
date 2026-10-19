import path from "node:path";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file URL, e.g. file:/data/ocr.db");
  }

  // Resolve against the project root for both Prisma CLI and the runtime adapter.
  return `file:${path.resolve(process.cwd(), url.slice("file:".length))}`;
}
