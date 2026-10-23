import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS_SENT,
  combine,
  createAssembler,
  decodeBasic,
  decodeP2P,
  encodeBasic,
  encodeP2P,
  frameCommand,
  metresToMm,
  shotToInstrument,
  spanBetween,
} from './protocol.js';

/** Idle packet captured from a D2G: distance only, unit code 9, counter 32. */
const IDLE = Uint8Array.from([
  0xf4, 0xdb, 0xb7, 0x40,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x09, 0x00,
  0x18, 0x00,
  0x00, 0x00,
  0x20, 0xc0,
]);

/** Tilted D2G packet. Inclination is radians, about 2.672 degrees. */
const TILTED = Uint8Array.from([
  0x40, 0x8c, 0xb1, 0x40,
  0x70, 0xe5, 0x3e, 0x3d,
  0x00, 0x00, 0x00, 0x00,
  0x09, 0x00, 0x18, 0x00, 0x00, 0x00,
  0x22, 0xc0,
]);

test('decodes a captured basic measurement as metres and radians', () => {
  const m = decodeBasic(IDLE);
  assert.ok(Math.abs(m.distanceM - 5.7458) < 0.001, String(m.distanceM));
  assert.equal(m.inclinationRad, 0);
  assert.equal(m.distanceUnit, 9);
  assert.equal(m.inclinationUnit, 24);
  assert.equal(m.counter, 0x20);
  assert.equal(m.flags, 0xc0);
  assert.equal(decodeBasic(IDLE.slice(0, 19)), null);
});

test('tilted packet inclination matches degrees, not a display unit', () => {
  const m = decodeBasic(TILTED);
  assert.ok(Math.abs(m.inclinationRad - 0.04664) < 0.0001, String(m.inclinationRad));
  const degrees = m.inclinationRad * (180 / Math.PI);
  assert.ok(Math.abs(degrees - 2.672) < 0.01, String(degrees));
  assert.equal(m.counter, 0x22);
});

test('unit code does not rescale the distance float', () => {
  const metres = decodeBasic(encodeBasic({ distanceM: 2.45, distanceUnit: 0 }));
  const alsoMetres = decodeBasic(encodeBasic({ distanceM: 2.45, distanceUnit: 9 }));
  assert.equal(metres.distanceM, alsoMetres.distanceM);
  assert.equal(metresToMm(2.45), 2450);
  assert.equal(metresToMm(1.2344), 1234);
});

test('P2P packet keeps azimuth and zenith and pairs on the low byte only', () => {
  const basic = encodeBasic({ distanceM: 3, inclinationRad: 0.2, counter: 7, flags: 0xc0 });
  const p2p = encodeP2P({ azimuthRad: 1.25, zenithRad: 0.9, counter: 7, flags: 0x90 });
  assert.notEqual(decodeBasic(basic).flags, decodeP2P(p2p).flags);
  assert.equal(decodeBasic(basic).counter, decodeP2P(p2p).counter);

  const got = [];
  const assembler = createAssembler((m) => got.push(m));
  assembler.pushP2P(p2p);
  assembler.pushBasic(basic);
  assert.equal(got.length, 1);
  assert.equal(got[0].hasStand, true);
  assert.ok(Math.abs(got[0].azimuthRad - 1.25) < 1e-6);
  assert.ok(Math.abs(got[0].distanceM - 3) < 1e-6);
});

test('a basic shot without stand angles still publishes distance and tilt', () => {
  const got = [];
  const assembler = createAssembler((m) => got.push(m));
  assembler.pushBasic(encodeBasic({ distanceM: 2.4, inclinationRad: Math.PI / 2, counter: 3 }), {
    schedule: false,
  });
  assert.equal(got.length, 0);
  assembler.flush(3);
  assert.equal(got.length, 1);
  assert.equal(got[0].hasStand, false);
  assert.ok(Math.abs(got[0].verticalM - 2.4) < 1e-6);
  assert.ok(Math.abs(got[0].horizontalM) < 1e-6);
});

test('all-zero P2P placeholder is not treated as a stand shot', () => {
  const shot = combine(
    { distanceM: 2, inclinationRad: 0, counter: 1 },
    { azimuthRad: 0, zenithRad: 0, counter: 1 },
  );
  assert.equal(shot.hasStand, false);
  assert.ok(Math.abs(shot.horizontalM - 2) < 1e-6);
  assert.ok(Math.abs(shot.verticalM) < 1e-6);
});

test('point-to-point distance is the chord between two stand shots', () => {
  const a = shotToInstrument(3, 0, Math.PI / 2);
  const b = shotToInstrument(4, Math.PI / 2, Math.PI / 2);
  const span = spanBetween(a, b);
  assert.ok(Math.abs(span.distanceM - 5) < 1e-9, String(span.distanceM));
  assert.equal(metresToMm(span.distanceM), 5000);

  const up = shotToInstrument(2.4, 0.4, 0);
  assert.ok(Math.abs(up.z - 2.4) < 1e-9);
  assert.ok(Math.abs(up.x) < 1e-9);
});

test('commands are CRLF framed and laser-off is not one of them', () => {
  const framed = frameCommand('raiseEvent 100');
  assert.equal(framed.at(-2), 0x0d);
  assert.equal(framed.at(-1), 0x0a);
  assert.equal(COMMANDS_SENT.includes('raiseEvent 12'), false);
  assert.ok(COMMANDS_SENT.includes('raiseEvent 100'));
});
