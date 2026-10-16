import type { Config } from '../../config.js';
import { withDatabase } from '../../db/socket.js';
import type { ComputeReading, DatabaseReading, MetricSample } from './types.js';

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const integer = (value: unknown) => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : finite(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
};

export async function readDatabase(config: Config, database: string): Promise<DatabaseReading> {
  // Observe from the system DB so the monitoring connection does not inflate
  // the selected branch's own connection count. All traffic is still Unix-only.
  return withDatabase({ ...config, SQL_TIMEOUT_MS: 5000 }, 'postgres', async client => {
    const { rows } = await client.query(`
      SELECT datid::text AS oid,pg_database_size(datid)::text AS size,numbackends,
        (SELECT count(*) FROM pg_stat_activity WHERE datname=$1 AND state='active') AS active,
        current_setting('max_connections')::int AS maximum,
        current_setting('track_counts') AS tracking,
        xact_commit::text AS commits,xact_rollback::text AS rollbacks,
        tup_inserted::text AS inserted,tup_updated::text AS updated,tup_deleted::text AS deleted,
        stats_reset FROM pg_stat_database WHERE datname=$1
    `, [database]);
    const row = rows[0];
    if (!row) throw new Error('Database statistics unavailable');
    const tracking = row.tracking === 'on';
    return {
      databaseSizeBytes: integer(row.size), connections: integer(row.numbackends),
      activeConnections: integer(row.active), maxConnections: integer(row.maximum),
      commits: tracking ? integer(row.commits) : null, rollbacks: tracking ? integer(row.rollbacks) : null,
      rowsInserted: tracking ? integer(row.inserted) : null, rowsUpdated: tracking ? integer(row.updated) : null,
      rowsDeleted: tracking ? integer(row.deleted) : null,
      databaseOid: String(row.oid), statsResetAt: row.stats_reset ? new Date(row.stats_reset).toISOString() : null,
    };
  });
}

export function readCompute(stats: unknown): ComputeReading {
  const data = stats as {
    cpu_stats?: { cpu_usage?: { total_usage?: number; percpu_usage?: number[] }; system_cpu_usage?: number; online_cpus?: number };
    precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
    memory_stats?: { usage?: number; limit?: number; stats?: { total_inactive_file?: number; inactive_file?: number } };
  };
  const cpu = data?.cpu_stats, previous = data?.precpu_stats, memory = data?.memory_stats;
  const used = finite(cpu?.cpu_usage?.total_usage), before = finite(previous?.cpu_usage?.total_usage);
  const system = finite(cpu?.system_cpu_usage), systemBefore = finite(previous?.system_cpu_usage);
  const cores = finite(cpu?.online_cpus ?? cpu?.cpu_usage?.percpu_usage?.length);
  const validCpu = used !== null && before !== null && used >= before && system !== null &&
    systemBefore !== null && system > systemBefore && cores !== null && cores > 0;
  const usage = finite(memory?.usage);
  const inactive = finite(memory?.stats?.total_inactive_file ?? memory?.stats?.inactive_file) ?? 0;
  return {
    cpuPercent: validCpu ? (used - before) / (system - systemBefore) * cores * 100 : null,
    memoryUsageBytes: usage !== null && inactive <= usage ? usage - inactive : null,
    memoryLimitBytes: finite(memory?.limit),
  };
}

export function activityRates(previous: MetricSample | null, current: DatabaseReading, now: number) {
  const elapsed = previous ? (now - Date.parse(previous.sampledAt)) / 1000 : 0;
  const baseline = previous && !previous.databaseError && previous.databaseOid === current.databaseOid &&
    previous.statsResetAt === current.statsResetAt && elapsed > 0;
  const rate = (keys: Array<'commits' | 'rollbacks' | 'rowsInserted' | 'rowsUpdated' | 'rowsDeleted'>) => {
    if (!baseline || !previous) return null;
    let difference = 0;
    for (const key of keys) {
      const before = previous[key], after = current[key];
      if (before === null || after === null || after < before) return null;
      difference += after - before;
    }
    return difference / elapsed;
  };
  return {
    transactionsPerSecond: rate(['commits', 'rollbacks']),
    rowsChangedPerSecond: rate(['rowsInserted', 'rowsUpdated', 'rowsDeleted']),
  };
}
