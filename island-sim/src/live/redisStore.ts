import type { RecordedLine } from "../thinkers/recorded";
import type { Feed } from "./feedTypes";
import type { IslandMeta, IslandStore } from "./island";

/**
 * The live island's store in Redis (Upstash, over its REST API, so no client
 * library is needed). Credentials from the variables the Vercel Marketplace
 * integration sets: KV_REST_API_URL / KV_REST_API_TOKEN, or
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
 */
export class RedisIslandStore implements IslandStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly prefix = "islandone:",
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env): RedisIslandStore {
    const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
    const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Redis fehlt: KV_REST_API_URL und KV_REST_API_TOKEN (oder UPSTASH_REDIS_REST_URL/_TOKEN) setzen");
    return new RedisIslandStore(url, token);
  }

  private async run<T>(...command: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command.map(String)),
    });
    const body = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || body.error) throw new Error(`Redis ${String(command[0])}: ${body.error ?? res.status}`);
    return body.result as T;
  }

  private key(name: string): string {
    return this.prefix + name;
  }

  async getMeta(): Promise<IslandMeta | null> {
    const raw = await this.run<string | null>("GET", this.key("meta"));
    return raw ? (JSON.parse(raw) as IslandMeta) : null;
  }
  async setMeta(meta: IslandMeta): Promise<void> {
    await this.run("SET", this.key("meta"), JSON.stringify(meta));
  }
  async getThoughts(islandId: string): Promise<RecordedLine[]> {
    const raw = await this.run<string[]>("LRANGE", this.key(`thoughts:${islandId}`), 0, -1);
    return raw.map((line) => JSON.parse(line) as RecordedLine);
  }
  async appendThoughts(islandId: string, lines: RecordedLine[]): Promise<void> {
    if (lines.length > 0) await this.run("RPUSH", this.key(`thoughts:${islandId}`), ...lines.map((l) => JSON.stringify(l)));
  }
  async getFeed(): Promise<Feed | null> {
    const raw = await this.run<string | null>("GET", this.key("feed"));
    return raw ? (JSON.parse(raw) as Feed) : null;
  }
  async setFeed(feed: Feed): Promise<void> {
    await this.run("SET", this.key("feed"), JSON.stringify(feed));
  }
  async lock(ttlMs: number): Promise<boolean> {
    return (await this.run<string | null>("SET", this.key("lock"), "1", "NX", "PX", ttlMs)) === "OK";
  }
  async unlock(): Promise<void> {
    await this.run("DEL", this.key("lock"));
  }
  async addSpent(month: string, usd: number): Promise<number> {
    return Number(await this.run<string>("INCRBYFLOAT", this.key(`spent:${month}`), usd.toFixed(6)));
  }
  async getSpent(month: string): Promise<number> {
    return Number((await this.run<string | null>("GET", this.key(`spent:${month}`))) ?? 0);
  }
}
