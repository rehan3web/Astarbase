import type { Config } from '../../config.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { PostgresContainer } from '../docker/postgres.js';
import { METRICS_RETENTION_DAYS } from '../../db/metrics-store.js';
import { activityRates, readCompute, readDatabase } from './readings.js';
import type { ActivityKind, ComputeReading, DatabaseReading, MetricSample } from './types.js';
import { PostgresLogSource } from './postgres-log-source.js';
import { QueryLogCollector } from './query-log-collector.js';

export const METRICS_INTERVAL_MS = 30000;
type Sources = { database: (database: string) => Promise<DatabaseReading>; compute: () => Promise<ComputeReading>; now: () => number };
const emptyDatabase: DatabaseReading = {
  databaseSizeBytes: null, connections: null, activeConnections: null, maxConnections: null,
  commits: null, rollbacks: null, rowsInserted: null, rowsUpdated: null, rowsDeleted: null,
  databaseOid: null, statsResetAt: null,
};
const emptyCompute: ComputeReading = { cpuPercent: null, memoryUsageBytes: null, memoryLimitBytes: null };

export class MetricsService {
  private sources: Sources;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private ticking = false;
  private pending = new Map<string, Promise<void>>();
  private errors = new Map<string, string[]>();
  private computeCache?: { expires: number; promise: Promise<ComputeReading> };
  private persistenceError = false;
  private queryLogs?: QueryLogCollector;
  constructor(config: Config, private catalog: Catalog, postgres: PostgresContainer, sources?: Partial<Sources>) {
    this.sources = {
      database: database => readDatabase(config, database),
      compute: async () => readCompute(await postgres.docker.stats()),
      now: () => Date.now(), ...sources,
    };
    if (config.POSTGRES_ACTIVITY_LOGS === 'true') {
      this.queryLogs = new QueryLogCollector(
        new PostgresLogSource(config, async file => { await postgres.docker.exec(['rm', '-f', '--', file], 5000); }),
        catalog.store.metrics, config.DB_USER,
        () => new Set(catalog.store.branches().map(branch => branch.database_name)), this.sources.now);
    }
  }
  private compute() {
    const now = this.sources.now();
    if (!this.computeCache || now >= this.computeCache.expires) {
      this.computeCache = { expires: now + METRICS_INTERVAL_MS, promise: this.sources.compute() };
      // Cache failures too: one Docker outage must not fan out across branches.
      void this.computeCache.promise.catch(() => undefined);
    }
    return this.computeCache.promise;
  }
  async collect(database: string): Promise<void> {
    if (this.stopped) return;
    const pending = this.pending.get(database);
    if (pending) return pending;
    const job = this.capture(database);
    this.pending.set(database, job);
    try { await job; } finally { this.pending.delete(database); }
  }
  private async capture(database: string) {
    const previous = this.catalog.store.metrics.latest(database);
    const now = this.sources.now();
    const [db, compute] = await Promise.allSettled([this.sources.database(database), this.compute()]);
    if (this.stopped) return;
    const databaseError = db.status === 'rejected' ? 'Postgres metrics unavailable over the Unix socket' : null;
    const computeError = compute.status === 'rejected' ? 'Postgres container statistics unavailable over the Docker Unix socket' : null;
    this.errors.set(database, [databaseError, computeError].filter((error): error is string => Boolean(error)));
    // No synthetic sample when neither source returned data. Keep old history.
    if (db.status === 'rejected' && compute.status === 'rejected') return;
    const reading = db.status === 'fulfilled' ? db.value : emptyDatabase;
    const sample: MetricSample = {
      ...reading, ...(compute.status === 'fulfilled' ? compute.value : emptyCompute),
      database, sampledAt: new Date(now).toISOString(), databaseError, computeError,
      ...activityRates(previous, reading, now),
    };
    this.catalog.store.metrics.save(sample);
    this.catalog.store.metrics.prune(now);
  }
  async read(database: string, hours: number, limit: number) {
    await this.catalog.assertDatabase(database);
    await this.queryLogs?.poll();
    this.catalog.store.metrics.prune(this.sources.now());
    const previous = this.catalog.store.metrics.latest(database);
    if (!previous || this.sources.now() - Date.parse(previous.sampledAt) >= METRICS_INTERVAL_MS) {
      await this.collect(database);
    }
    const now = this.sources.now();
    const latest = this.catalog.store.metrics.latest(database);
    const errors = this.errors.get(database) ?? [latest?.databaseError, latest?.computeError].filter((error): error is string => Boolean(error));
    return {
      database, latest, history: this.catalog.store.metrics.history(database, hours, limit, now),
      events: this.catalog.store.metrics.events(database, hours, now),
      activity: { ...this.catalog.store.metrics.activity(database, hours, now),
        ...(this.queryLogs ? { monitoring: this.queryLogs.status() } : {}) },
      stale: !latest || errors.length === 2 || now - Date.parse(latest.sampledAt) > 90000,
      errors: [...errors, ...(this.persistenceError ? ['Activity history could not be persisted'] : [])],
      intervalSeconds: METRICS_INTERVAL_MS / 1000, retentionDays: METRICS_RETENTION_DAYS,
      computeScope: 'postgres-container' as const,
    };
  }
  async track<T>(database: string, kind: ActivityKind, work: () => Promise<T>): Promise<T> {
    // In log mode PostgreSQL is the single source of query runs. Never count
    // API requests again, and do not mix branch-refresh jobs with SQL executions.
    if (this.queryLogs) return work();
    const started = performance.now();
    const record = (status: 'success' | 'error') => {
      if (this.stopped) return;
      try {
        this.catalog.store.metrics.event(database, kind, status, performance.now() - started, this.sources.now());
        this.persistenceError = false;
      } catch {
        this.persistenceError = true;
        console.error('[metrics] Unable to persist activity metadata; the original operation result is unchanged');
      }
    };
    try { const result = await work(); record('success'); return result; }
    catch (error) { record('error'); throw error; }
  }
  start() {
    if (this.timer || this.stopped) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), METRICS_INTERVAL_MS);
    this.timer.unref();
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      await this.queryLogs?.poll();
      this.catalog.store.metrics.prune(this.sources.now());
      for (const branch of this.catalog.store.branches()) {
        if (this.stopped) break;
        await this.collect(branch.database_name);
      }
    } catch {
      console.error('[metrics] Sampling failed; inspect the local Unix sockets and SQLite storage');
    } finally { this.ticking = false; }
  }
  stop() { this.stopped = true; this.queryLogs?.stop(); if (this.timer) clearInterval(this.timer); }
}
