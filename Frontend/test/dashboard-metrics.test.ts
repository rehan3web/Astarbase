import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBytes, formatMetric, formatRate, formatTimestamp } from '../lib/dashboard-metrics'

test('metrics format real zero distinctly from missing readings and never invent history', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1048576), '1 MiB')
  assert.equal(formatBytes(null), 'Unavailable')
  assert.equal(formatBytes(-1), 'Unavailable')
  assert.equal(formatMetric(125, '%'), '125%')
  assert.equal(formatMetric(null), 'Unavailable')
  assert.equal(formatMetric(Infinity), 'Unavailable')
  assert.equal(formatRate(null, 'tx/s'), 'Awaiting baseline')
  assert.equal(formatRate(0, 'tx/s'), '0 tx/s')
  assert.equal(formatTimestamp('not-a-date'), 'Unavailable')
})
