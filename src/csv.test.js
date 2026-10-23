import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, toCsv } from './csv.js';

test('csv quotes commas and keeps millimetre columns', () => {
  const rows = buildRows({
    project: { name: 'Crofts Bank Road' },
    plots: [{
      id: 'p1',
      name: 'Flat 5 - Design - 1',
      projectNumber: '1686/6/1',
      status: 'in_progress',
      pages: [{ index: 2, label: 'Plan' }],
    }],
    entries: [{
      id: 'e1',
      plotId: 'p1',
      num: 3,
      page: 2,
      kind: 'beam',
      fields: { alongMm: 1200, widthMm: 180, heightUnderMm: 2140 },
      note: 'Drops in front of wall units, "check"',
      geom: { x: 0.25, y: 0.5 },
      createdAt: Date.parse('2026-10-26T09:15:00Z'),
    }],
  });
  const csv = toCsv(rows);
  assert.match(csv, /1686\/6\/1/);
  assert.match(csv, /2140/);
  assert.match(csv, /"Drops in front of wall units, ""check"""/);
  assert.match(csv, /25%,50%/);
});
