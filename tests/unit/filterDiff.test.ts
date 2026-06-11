import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterDiff } from '@workshop/agent'

const patches = [
  { file: 'src/index.ts', diff: 'a' },
  { file: 'package-lock.json', diff: 'b' },
  { file: 'dist/app.min.js', diff: 'c' },
  { file: 'styles.css', diff: 'd' },
]

test('filterDiff drops noise files by default', () => {
  const result = filterDiff(patches)
  assert.deepEqual(
    result.patches.map((p) => p.file),
    ['src/index.ts', 'styles.css'],
  )
  assert.deepEqual(result.dropped.sort(), ['dist/app.min.js', 'package-lock.json'])
})

test('filterDiff on a clean diff drops nothing', () => {
  const clean = [{ file: 'a.ts', diff: 'x' }]
  const result = filterDiff(clean)
  assert.equal(result.patches.length, 1)
  assert.equal(result.dropped.length, 0)
})
