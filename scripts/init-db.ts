import { ensureSchema } from "../src/lib/db.js";

async function main() {
  await ensureSchema();
  console.log("✓ schema ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
