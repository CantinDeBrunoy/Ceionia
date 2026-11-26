/** Types minimaux de D1 et des liaisons du Worker (le projet n'embarque pas @cloudflare/workers-types) */
export interface D1Result<T> { results: T[] }
export interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database { prepare(sql: string): D1Statement; batch(s: D1Statement[]): Promise<D1Result<unknown>[]> }
export interface RateLimit { limit(o: { key: string }): Promise<{ success: boolean }> }
