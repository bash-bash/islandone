import type { IncomingMessage, ServerResponse } from "node:http";
import { advanceIsland } from "../src/live/island";
import { RedisIslandStore } from "../src/live/redisStore";
import { LlmThinker } from "../src/thinkers/llm";

// Vercel Cron calls this every minute (docs/ETAPPE_7_PLAN.md §3): compute the island up to
// now plus a lead, ask Claude for new moments, store thoughts and the feed for viewers.
// Only Vercel Cron may call it, since every call can cost money.

export default async function tick(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    send(res, 401, { error: "nur für Vercel Cron (CRON_SECRET)" });
    return;
  }
  const now = Date.now();
  try {
    const result = await advanceIsland(RedisIslandStore.fromEnv(), {
      now,
      month: new Date(now).toISOString().slice(0, 7),
      createThinker: () => new LlmThinker({ model: process.env.ISLAND_SIM_MODEL ?? "claude-sonnet-5-5" }),
      monthlyBudgetUsd: Number(process.env.ISLAND_MONTHLY_BUDGET_USD ?? 43),
    });
    send(res, 200, result);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
