'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diaryDateStr } = require('../diary.js');

test('diaryDateStr: formats YYYY-MM-DD correctly', () => {
  const d = new Date(2026, 3, 11); // April 11, 2026 (month is 0-indexed)
  assert.equal(diaryDateStr(d), '2026-04-11');
});

test('diaryDateStr: pads single-digit month and day', () => {
  const d = new Date(2026, 0, 5);
  assert.equal(diaryDateStr(d), '2026-01-05');
});

test('diaryDateStr: uses today when no date provided', () => {
  const result = diaryDateStr();
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test('diaryDateStr: end of year', () => {
  const d = new Date(2026, 11, 31);
  assert.equal(diaryDateStr(d), '2026-12-31');
});
