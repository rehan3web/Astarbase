export const SLOW_OPERATION_MS = 1000;
export type ActivityRow = {
  sampledAt: number; databaseOid: string | null; statsResetAt: string | null;
  databaseError: string | null; inserted: number | null; updated: number | null; deleted: number | null;
};
export type RunBucket = { bucket: number; succeeded: number; slow: number; failed: number };

export function activityWindow(hours: number, now: number, firstRecordedAt: number | null) {
  const width = hours * 3600000 / 24;
  if (firstRecordedAt === null || firstRecordedAt > now) return { start: now, width, count: 0 };
  const elapsed = Math.floor((now - firstRecordedAt) / width);
  return { start: firstRecordedAt + Math.max(0, elapsed - 23) * width, width, count: Math.min(24, elapsed + 1) };
}

export function buildActivity(rows: ActivityRow[], runs: RunBucket[], hours: number, now: number,
  firstRecordedAt: number | null = rows[0]?.sampledAt ?? null) {
  const { start, width, count } = activityWindow(hours, now, firstRecordedAt);
  const buckets = Array.from({ length: count }, (_, index) => ({
    startAt: new Date(start + index * width).toISOString(),
    endAt: new Date(Math.min(now, start + (index + 1) * width)).toISOString(),
    runs: null as { succeeded: number; slow: number; failed: number } | null,
    rows: null as { inserted: number; updated: number; deleted: number } | null,
  }));
  for (const run of runs) {
    if (run.bucket >= 0 && run.bucket < count) {
      buckets[run.bucket].runs = { succeeded: run.succeeded, slow: run.slow, failed: run.failed };
    }
  }
  let previous: ActivityRow | undefined;
  for (const row of rows) {
    const validPair = previous && previous.sampledAt >= start && row.sampledAt <= now &&
      row.sampledAt > previous.sampledAt && row.sampledAt - previous.sampledAt <= 90000 &&
      row.databaseOid !== null && previous.databaseOid === row.databaseOid &&
      previous.statsResetAt === row.statsResetAt && !previous.databaseError && !row.databaseError;
    if (validPair && previous) {
      const keys = ['inserted', 'updated', 'deleted'] as const;
      if (keys.every(key => row[key] !== null && previous![key] !== null && row[key]! >= previous![key]!)) {
        const index = Math.min(23, Math.max(0, Math.floor((row.sampledAt - start) / width)));
        const totals = buckets[index].rows ?? { inserted: 0, updated: 0, deleted: 0 };
        for (const key of keys) totals[key] += row[key]! - previous[key]!;
        buckets[index].rows = totals;
      }
    }
    previous = row;
  }
  return { startAt: new Date(start).toISOString(), endAt: new Date(now).toISOString(),
    slowThresholdMs: SLOW_OPERATION_MS, buckets };
}
