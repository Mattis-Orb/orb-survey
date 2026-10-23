import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPage, labelPages, mergeWinner, nameFromFilename, parseWinnerText } from './winner.js';

const PERSPECTIVE =
  'Perspective drawing, Project number: 1686/6/1 Project: Crofts Bank Road Design: Flat 5 - Design - 1 14/09/2026';
const PLAN =
  'Plan view:  1686/6/1  Flat 5 - Design - 1 Printed: 14.09.2026 Project:  Crofts Bank Road Scale: Fit to frame';
const PLAN_AGAIN =
  'Plan view, Project number: 1686/6/1 Project: Crofts Bank Road Design: Flat 5 - Design - 1 14/09/2026';
const WALL =
  'Elevation, Project number: 1686/6/1 Project: Crofts Bank Road Design: Flat 5 - Design - 1 - Wall - 1 14/09/2026';
const WALL_5 =
  'Elevation, Project number: 1686/6/1 Project: Crofts Bank Road Design: Flat 5 - Design - 1 - Wall - 5 14/09/2026';

test('reads the design name, site name, and project number', () => {
  const parsed = parseWinnerText(PERSPECTIVE);
  assert.equal(parsed.designName, 'Flat 5 - Design - 1');
  assert.equal(parsed.projectName, 'Crofts Bank Road');
  assert.equal(parsed.projectNumber, '1686/6/1');
});

test('elevation headers do not swallow the wall into the plot name', () => {
  const parsed = parseWinnerText(WALL);
  assert.equal(parsed.designName, 'Flat 5 - Design - 1');
});

test('plan-view line without a Design label still names the plot', () => {
  const parsed = parseWinnerText(PLAN);
  assert.equal(parsed.designName, 'Flat 5 - Design - 1');
  assert.equal(parsed.projectName, 'Crofts Bank Road');
  assert.equal(parsed.projectNumber, '1686/6/1');
});

test('first plan page is the default, elevations keep their wall number', () => {
  const pages = labelPages([PERSPECTIVE, PLAN, PLAN_AGAIN, WALL, WALL_5]);
  assert.deepEqual(
    pages.map((page) => page.label),
    ['Perspective', 'Plan', 'Plan 2', 'Wall 1', 'Wall 5'],
  );
  assert.equal(defaultPage(pages), 2);
});

test('merge keeps the first value found and filename is the fallback', () => {
  const merged = mergeWinner([WALL, PERSPECTIVE]);
  assert.equal(merged.designName, 'Flat 5 - Design - 1');
  assert.equal(nameFromFilename('Flat_12_kitchen.pdf'), 'Flat 12 kitchen');
  assert.equal(nameFromFilename(''), 'Plot');
});
