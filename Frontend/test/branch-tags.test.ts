import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTagBadgeStyle, isValidBranchTag } from '../components/branches/branchTag'

test('branch tag inputs allow clearing and valid custom names, but reject invalid or oversized values', () => {
  for (const tag of ['', 'dev', 'Production', 'release/v1', 'QA team', 'test-db_2.0', '测试']) {
    assert.equal(isValidBranchTag(tag), true, tag)
  }
  for (const tag of [' ', 'bad\nvalue', '<script>', '-dev', 'a'.repeat(33), '\u{10400}'.repeat(17)]) {
    assert.equal(isValidBranchTag(tag), false, tag)
  }
})

test('branch tags retain original badge styling and accept custom values', () => {
  assert.equal(getTagBadgeStyle('PRODUCTION'), getTagBadgeStyle('prod'))
  assert.match(getTagBadgeStyle('staging'), /blue/)
  assert.match(getTagBadgeStyle('preview'), /purple/)
  assert.equal(getTagBadgeStyle('custom release'), getTagBadgeStyle('dev'))
})
