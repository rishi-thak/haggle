import { BrowserUse } from "browser-use-sdk";
import { z } from "zod4";

const apiKey = process.env.BROWSER_USE_API_KEY;
if (!apiKey) {
  console.error("BROWSER_USE_API_KEY not set");
  process.exit(1);
}

const Schema = z.object({
  fact: z.string(),
  source: z.string(),
});

(async () => {
  const client = new BrowserUse({ apiKey });

  const account = await client.billing.account();
  console.log("auth ✓ credits =", account.totalCreditsBalanceUsd);

  console.log("running cheap task…");
  const t0 = Date.now();
  const result = await client.run(
    "Visit https://example.com. Return a JSON object with: fact = a one-sentence description of the page content, source = the page URL.",
    { schema: Schema },
  );
  console.log(`task finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("output:", result.output);
})();
