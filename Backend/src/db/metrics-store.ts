import type { DatabaseSync } from 'node:sqlite';
import type { ActivityEvent, ActivityKind, MetricSample } from '../services/metrics/types.js';
import { buildActivity, SLOW_OPERATION_MS, type ActivityRow, type RunBucket } from '../services/metrics/activity.js';

export const METRICS_RETENTION_DAYS = 7;
export class MetricsStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS metric_samples (
        database_name TEXT NOT NULL, sampled_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK(json_valid(data)),
        PRIMARY KEY(database_name,sampled_at)
      );
      CREATE TABLE IF NOT EXISTS metric_events (
        id INTEGER PRIMARY KEY, database_name TEXT NOT NULL, occurred_at INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('query','branch-refresh')),
        status TEXT NOT NULL CHECK(status IN ('success','error')),
        duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0)
      );
      CREATE INDEX IF NOT EXISTS metric_events_database_time ON metric_events(database_name,occurred_at);
      CREATE INDEX IF NOT EXISTS metric_samples_time ON metric_samples(sampled_at);
      CREATE INDEX IF NOT EXISTS metric_events_time ON metric_events(occurred_at);
    `);
  }
  save(sample: MetricSample) {
    this.db.prepare('INSERT OR REPLACE INTO metric_samples(database_name,sampled_at,data) VALUES(?,?,?)')
      .run(sample.database, Date.parse(sample.sampledAt), JSON.stringify(sample));
  }
  latest(database: string): MetricSample | null {
    const row = this.db.prepare('SELECT data FROM metric_samples WHERE database_name=? ORDER BY sampled_at DESC LIMIT 1').get(database);
    return row ? JSON.parse(String(row.data)) as MetricSample : null;
  }
  history(database: string, hours: number, limit: number, now: number): MetricSample[] {
    const since = now - hours * 3600000;
    const bucket = Math.max(1, Math.ceil(hours * 3600000 / limit));
    // One actual reading per time bucket; no filled gaps or synthetic history.
    const rows = this.db.prepare(`
      SELECT data FROM (
        SELECT data,sampled_at,ROW_NUMBER() OVER (
          PARTITION BY CAST((sampled_at-?)/? AS INTEGER) ORDER BY sampled_at DESC
        ) AS position FROM metric_samples
        WHERE database_name=? AND sampled_at>=? AND sampled_at<=?
      ) WHERE position=1 ORDER BY sampled_at DESC LIMIT ?
    `).all(since, bucket, database, since, now, limit);
    return rows.reverse().map(row => JSON.parse(String(row.data)) as MetricSample);
  }
  event(database: string, kind: ActivityKind, status: 'success' | 'error', durationMs: number, now: number) {
    this.db.prepare('INSERT INTO metric_events(database_name,occurred_at,kind,status,duration_ms) VALUES(?,?,?,?,?)')
      .run(database, now, kind, status, Math.max(0, Math.round(durationMs)));
  }
  events(database: string, hours: number, now: number): ActivityEvent[] {
    return this.db.prepare(`
      SELECT id,database_name AS database,kind,status,duration_ms AS durationMs,occurred_at
      FROM metric_events WHERE database_name=? AND occurred_at>=? AND occurred_at<=?
      ORDER BY occurred_at DESC,id DESC LIMIT 30
    `).all(database, now - hours * 3600000, now).map(({ occurred_at, ...row }) => ({
      ...row, occurredAt: new Date(Number(occurred_at)).toISOString(),
    }) as ActivityEvent);
  }
  activity(database: string, hours: number, now: number) {
    const since = now - hours * 3600000, width = hours * 3600000 / 24;
    // Aggregate the full persisted event window, not just the recent 30-event list.
    const runs = this.db.prepare(`
      SELECT MIN(23,CAST((occurred_at-?)/? AS INTEGER)) AS bucket,
        SUM(status='success' AND duration_ms<?) AS succeeded,
        SUM(status='success' AND duration_ms>=?) AS slow,
        SUM(status='error') AS failed
      FROM metric_events WHERE database_name=? AND occurred_at>=? AND occurred_at<=?
      GROUP BY bucket ORDER BY bucket
    `).all(since, width, SLOW_OPERATION_MS, SLOW_OPERATION_MS, database, since, now) as RunBucket[];
    const rows = this.db.prepare(`
      SELECT sampled_at AS sampledAt,json_extract(data,'$.databaseOid') AS databaseOid,
        json_extract(data,'$.statsResetAt') AS statsResetAt,
        json_extract(data,'$.databaseError') AS databaseError,
        json_extract(data,'$.rowsInserted') AS inserted,
        json_extract(data,'$.rowsUpdated') AS updated,
        json_extract(data,'$.rowsDeleted') AS deleted
      FROM metric_samples WHERE database_name=? AND sampled_at>=? AND sampled_at<=?
      ORDER BY sampled_at
    `).all(database, since, now) as ActivityRow[];
    return buildActivity(rows, runs, hours, now);
  }
  prune(now: number) {
    const cutoff = now - METRICS_RETENTION_DAYS * 86400000;
    this.db.prepare('DELETE FROM metric_samples WHERE sampled_at<?').run(cutoff);
    this.db.prepare('DELETE FROM metric_events WHERE occurred_at<?').run(cutoff);
  }
}
