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

  it("thinkers (rules or LLM) never import the world, perception or the Creator", () => {
    const offenders: string[] = [];
    for (const file of files(join(SRC, "thinkers"))) {
      for (const spec of imports(file)) {
        if (spec.includes("/world/") || spec.includes("/perception/") || spec.includes("/creator/")) offenders.push(`${relative(SRC, file)} -> ${spec}`);
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

describe("observations carry no hidden world facts (Handoff §5, §36)", () => {
  it("never mentions thing kinds, place labels or exact body numbers", async () => {
    const { runSimulation } = await import("../src/sim");
    const { THING_SPECS, PLACES } = await import("../src/world/island");
    const forbidden = new Set<string>([...THING_SPECS.map((t) => t.kind), ...PLACES.map((p) => p.label)]);
    const seen: unknown[] = [];
    const spy = () => ({
      observe(observations: readonly unknown[]) {
        seen.push(...observations);
      },
      decide: () => ({ kind: "move", to: ["p2", "p3", "p5", "p1"][seen.length % 4]!, purpose: "explore" }) as const,
    });
    runSimulation({ seed: 3, days: 3, createMind: spy });
    expect(seen.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "string" && forbidden.has(v)) offenders.push(`${path} = ${v}`);
      if (typeof v === "number" && !Number.isInteger(v)) offenders.push(`${path} = ${v} (exact value)`);
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    seen.forEach((o, i) => walk(o, `obs[${i}]`));
    expect(offenders).toEqual([]);
  });
});
