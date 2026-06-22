import crypto from "node:crypto";

import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

import { pool } from "../db.js";

export class PostgresRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs: number;
  private nextPruneAtMs = 0;

  constructor(scope: string, windowMs: number) {
    this.prefix = scope;
    this.windowMs = windowMs;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const result = await pool.query<{ total_hits: number; window_reset_at: Date }>(
      `select total_hits, window_reset_at
       from anonymous_rate_limits
       where scope = $1
         and client_key_hash = $2
         and window_reset_at > now()`,
      [this.prefix, hashRateLimitKey(key)]
    );
    const row = result.rows[0];

    return row
      ? {
          totalHits: row.total_hits,
          resetTime: row.window_reset_at
        }
      : undefined;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    await this.pruneExpiredIfDue();

    const result = await pool.query<{ total_hits: number; window_reset_at: Date }>(
      `insert into anonymous_rate_limits (
         scope,
         client_key_hash,
         total_hits,
         window_reset_at
       )
       values ($1, $2, 1, now() + ($3::text || ' milliseconds')::interval)
       on conflict (scope, client_key_hash)
       do update
       set total_hits = case
             when anonymous_rate_limits.window_reset_at <= now() then 1
             else anonymous_rate_limits.total_hits + 1
           end,
           window_reset_at = case
             when anonymous_rate_limits.window_reset_at <= now()
               then now() + ($3::text || ' milliseconds')::interval
             else anonymous_rate_limits.window_reset_at
           end,
           updated_at = now()
       returning total_hits, window_reset_at`,
      [this.prefix, hashRateLimitKey(key), this.windowMs]
    );
    const row = result.rows[0];

    return {
      totalHits: row.total_hits,
      resetTime: row.window_reset_at
    };
  }

  async decrement(key: string): Promise<void> {
    await pool.query(
      `update anonymous_rate_limits
       set total_hits = greatest(total_hits - 1, 0),
           updated_at = now()
       where scope = $1
         and client_key_hash = $2`,
      [this.prefix, hashRateLimitKey(key)]
    );
  }

  async resetKey(key: string): Promise<void> {
    await pool.query(
      `delete from anonymous_rate_limits
       where scope = $1
         and client_key_hash = $2`,
      [this.prefix, hashRateLimitKey(key)]
    );
  }

  async resetAll(): Promise<void> {
    await pool.query(`delete from anonymous_rate_limits where scope = $1`, [this.prefix]);
  }

  private async pruneExpiredIfDue(): Promise<void> {
    const now = Date.now();

    if (now < this.nextPruneAtMs) {
      return;
    }

    this.nextPruneAtMs = now + 60_000;
    await pool.query(`delete from anonymous_rate_limits where window_reset_at <= now()`);
  }
}

function hashRateLimitKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
