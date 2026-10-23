// Builds the whole site for Vercel with the Build Output API (docs/ETAPPE_7_PLAN.md §3):
// island-render as static files, island-sim's api/*.ts bundled into functions, and the cron.
// Run from the repository root: node island-sim/scripts/build-vercel.mjs
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, ".vercel", "output");
rmSync(out, { recursive: true, force: true });

// The page: in live mode the player reads /api/island instead of a ?feed= file.
execSync("npm run build", { cwd: join(root, "island-render"), stdio: "inherit", env: { ...process.env, VITE_LIVE_FEED: "/api/island" } });
cpSync(join(root, "island-render", "dist"), join(out, "static"), { recursive: true });

const functions = { tick: { maxDuration: 300 }, island: { maxDuration: 10 } };
for (const [name, config] of Object.entries(functions)) {
  const dir = join(out, "functions", "api", `${name}.func`);
  mkdirSync(dir, { recursive: true });
  await build({
    entryPoints: [join(root, "island-sim", "api", `${name}.ts`)],
    outfile: join(dir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // Some dependencies still use require(); give the ESM bundle one.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  writeFileSync(
    join(dir, ".vc-config.json"),
    JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, ...config }, null, 2),
  );
}

writeFileSync(
  join(out, "config.json"),
  JSON.stringify({ version: 3, crons: [{ path: "/api/tick", schedule: "* * * * *" }] }, null, 2),
);
console.log("Vercel build output in .vercel/output");
