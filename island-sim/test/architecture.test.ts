import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

function imports(path: string): string[] {
  const text = readFileSync(path, "utf8");
  return [...text.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => (m[1] ?? m[2])!,
  );
}

describe("epistemic firewall (Handoff §5, §28, §36)", () => {
  it("src/mind imports only src/mind and src/core", () => {
    const offenders: string[] = [];
    for (const file of files(join(SRC, "mind"))) {
      for (const spec of imports(file)) {
        const allowed = spec.startsWith("./") || spec.startsWith("../core/");
        if (!allowed) offenders.push(`${relative(SRC, file)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("determinism hygiene", () => {
  it("uses no Math.random, Date or performance timers in the simulation", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      if (file.endsWith("cli.ts")) continue; // the CLI may time the run
      const text = stripComments(readFileSync(file, "utf8"));
      for (const banned of ["Math.random", "Date.now", "new Date", "performance.now"]) {
        if (text.includes(banned)) offenders.push(`${relative(SRC, file)}: ${banned}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
