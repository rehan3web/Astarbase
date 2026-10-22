export type DatabaseReading = {
  databaseSizeBytes: number | null; connections: number | null; activeConnections: number | null;
  maxConnections: number | null; commits: number | null; rollbacks: number | null;
  rowsInserted: number | null; rowsUpdated: number | null; rowsDeleted: number | null;
  databaseOid: string | null; statsResetAt: string | null;
};
export type ComputeReading = {
  cpuPercent: number | null; memoryUsageBytes: number | null; memoryLimitBytes: number | null;
};
export type MetricSample = DatabaseReading & ComputeReading & {
  database: string; sampledAt: string;
  transactionsPerSecond: number | null; rowsChangedPerSecond: number | null;
  databaseError: string | null; computeError: string | null;
};
export type ActivityKind = 'query' | 'branch-refresh';
export type ActivityEvent = {
  id: number; database: string; kind: ActivityKind; status: 'success' | 'error';
  durationMs: number; occurredAt: string;
};
export type QueryLogEvent = {
  database: string; status: 'success' | 'error'; durationMs: number; occurredAt: number;
};
