import type { IncomingMessage, ServerResponse } from "node:http";
import { RedisIslandStore } from "../src/live/redisStore";

// The live feed for viewers. Every viewer gets the same stored feed, cached briefly by the CDN,
// so the island costs the same however many people watch.

export default async function island(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  try {
    const feed = await RedisIslandStore.fromEnv().getFeed();
    if (!feed) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Die Insel läuft noch nicht" }));
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
    res.end(JSON.stringify(feed));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
}
