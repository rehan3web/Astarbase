import { createHash } from 'node:crypto';
import type { MetricsStore } from '../../db/metrics-store.js';
import type { QueryLogEvent } from './types.js';
import type { ActivityLogSource } from './postgres-log-source.js';

type RecordedEvent = QueryLogEvent & { sourceId: string };
export type QueryMonitoring = {
  source: 'postgres-logs'; status: 'collecting' | 'active' | 'unavailable' | 'degraded';
  since: string | null; lastCollectedAt: string | null; message: string | null;
};

export function parseQueryLog(line: string, adminUser: string, databases: Set<string>): RecordedEvent | null {
  const row = JSON.parse(line) as Record<string, unknown>;
  if (!row || typeof row !== 'object') return null;
  if (typeof row.dbname !== 'string' || !databases.has(row.dbname) ||
    typeof row.user !== 'string' || !row.user ||
    (row.user === adminUser && row.application_name !== 'sorabase-sql') ||
    row.backend_type !== 'client backend') return null;
  const occurredAt = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
  if (!Number.isFinite(occurredAt) || typeof row.session_id !== 'string' ||
    typeof row.session_start !== 'string' || !Number.isSafeInteger(row.line_num)) return null;
  let status: 'success' | 'error';
  let durationMs = 0;
  if (row.error_severity === 'ERROR') {
    // Error messages may include user data. Never persist the message, SQLSTATE
    // details, SQL, bind values, user identity or remote client address.
    status = 'error';
  } else {
    // JSON "ps" is the PostgreSQL command tag. Parse and Bind timings are
    // protocol phases, not query executions; counting all three would inflate
    // node-postgres/JDBC/prepared-statement traffic.
    if (row.error_severity !== 'LOG' || row.ps === 'PARSE' || row.ps === 'BIND' ||
      typeof row.message !== 'string') return null;
    const match = /^duration: ([0-9]+(?:\.[0-9]+)?) ms$/.exec(row.message);
    if (!match) return null;
    durationMs = Number(match[1]);
    if (!Number.isFinite(durationMs)) return null;
    status = 'success';
  }
  return {
    database: row.dbname, status, durationMs, occurredAt,
    sourceId: createHash('sha256').update(`${row.session_id}|${row.session_start}|${row.line_num}`).digest('hex'),
  };
}

const CHUNK_BYTES = 1024 * 1024;
const MAX_CHUNKS = 16;
export class QueryLogCollector {
  private pending?: Promise<void>;
  private nextPoll = 0;
  private closed = false;
  private error: string | null = null;
  private lastCollectedAt: string | null = null;
  private catchingUp = false;
  constructor(private source: ActivityLogSource, private store: MetricsStore, private adminUser: string,
    private databases: () => Set<string>, private now = () => Date.now()) {}
  status(): QueryMonitoring {
    const gap = Number(this.store.logMetadata('gapAt')) > this.now() - 7 * 86400000
      ? this.store.logMetadata('gap') : null;
    const backlog = this.catchingUp ? 'Query activity collection is catching up; recent counts may be delayed.' : null;
    return {
      source: 'postgres-logs',
      status: this.error ? 'unavailable' : gap || backlog ? 'degraded' : this.lastCollectedAt ? 'active' : 'collecting',
      since: this.store.logMetadata('since'), lastCollectedAt: this.lastCollectedAt,
      message: this.error ?? gap ?? backlog,
    };
  }
  poll(force = false): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    if (!force && this.now() < this.nextPoll) return Promise.resolve();
    this.pending = this.capture().catch(() => {
      // Never log the exception: database/JSON errors can include source text.
      this.error = 'Query activity collection unavailable. Check PostgreSQL activity logging, the Unix socket and admin storage.';
    }).finally(() => { this.pending = undefined; this.nextPoll = this.now() + 5000; });
    return this.pending;
  }
  private gap() {
    this.store.setLogMetadata('gap', 'Some query activity could not be collected (log rotation, restart, malformed or oversized record). Counts may be incomplete.');
    this.store.setLogMetadata('gapAt', String(this.now()));
  }
  private async capture() {
    const inventory = await this.source.inventory();
    if (this.closed) return;
    const now = this.now();
    this.catchingUp = false;
    if (inventory.files.reduce((total, file) => total + file.size, 0) >= 56 * 1024 * 1024) this.gap();
    if (!this.store.logMetadata('since')) this.store.setLogMetadata('since', new Date(now).toISOString());
    const cursors = new Map(this.store.logCursors().map(cursor => [cursor.name, cursor]));
    const names = new Set(inventory.files.map(file => file.name));
    for (const cursor of cursors.values()) {
      if (!names.has(cursor.name)) {
        // A missing checkpointed current file can have grown since the last
        // poll, even if its previous observed length was completely consumed.
        this.gap();
        this.store.forgetLog(cursor.name);
      }
    }
    let budget = MAX_CHUNKS;
    const databases = this.databases();
    for (const file of inventory.files) {
      if (this.closed) break;
      if (budget <= 0) { this.catchingUp = true; break; }
      const cursor = cursors.get(file.name);
      let offset = cursor?.offset ?? 0;
      let discarding = !!cursor?.discarding;
      if (offset > file.size) { offset = 0; discarding = false; this.gap(); }
      while (offset < file.size && budget-- > 0) {
        const bytes = await this.source.read(file.name, offset, Math.min(CHUNK_BYTES, file.size - offset));
        if (this.closed) return;
        if (!bytes?.length) { this.gap(); break; }
        const end = bytes.lastIndexOf(10);
        if (end < 0) {
          // Leave a normal, unfinished line for the next collection. Oversized
          // records are discarded in bounded chunks, never loaded unboundedly.
          if (bytes.length < CHUNK_BYTES) {
            if (file.name !== inventory.current) {
              this.gap(); offset += bytes.length; discarding = false;
              this.store.ingestLog(file.name, offset, false, file.size, [], now);
            }
            break;
          }
          discarding = true; offset += bytes.length; this.gap();
          this.store.ingestLog(file.name, offset, discarding, file.size, [], now);
          continue;
        }
        const events: RecordedEvent[] = [];
        let start = 0;
        if (discarding) { start = bytes.indexOf(10) + 1; discarding = false; }
        for (const line of bytes.subarray(start, end + 1).toString('utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const event = parseQueryLog(line, this.adminUser, databases);
            if (event && event.occurredAt >= now - 7 * 86400000 && event.occurredAt <= now + 60000) events.push(event);
          } catch { this.gap(); }
        }
        offset += end + 1;
        this.store.ingestLog(file.name, offset, discarding, file.size, events, now);
      }
      if (offset < file.size && budget <= 0) this.catchingUp = true;
      if (this.closed) return;
      if (offset === file.size && file.name !== inventory.current) {
        await this.source.remove(file.name);
        if (this.closed) return;
        this.store.forgetLog(file.name);
      }
    }
    this.lastCollectedAt = new Date(now).toISOString();
    this.error = null;
  }
  stop() { this.closed = true; }
}
