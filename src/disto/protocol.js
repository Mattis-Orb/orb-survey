/**
 * Leica DISTO Bluetooth LE measurement decoding.
 *
 * The GATT layout is not in the X6 user manual. It is the profile Leica's own
 * DISTO Transfer desktop software uses, corroborated by independent captures:
 *
 * - Service 3ab10100-f831-4395-b29d-570977d5bf94 is the DISTO service.
 *   Confirmed on a D2 (seichter/d2relay GATT dump; Stack Overflow Web Bluetooth
 *   D2 sample) and on an X3 (sedlak477/d2relay).
 * - Distance is a little-endian IEEE-754 float in metres, regardless of the
 *   unit shown on the laser. Captured on a D2 and on an X3 switched to inches.
 * - Models from the X3 onward (X3, X4, D5, X6 — the desktop software calls
 *   this "X3 or later"; the X6 is model id 13) push one 20-byte
 *   BASIC_MEASUREMENT_VALUES indication and, with a DST 360 / DST 360-X,
 *   a 12-byte P2P_MEASUREMENTS indication. They do not use the older
 *   4-byte distance characteristic. Commands are UTF-8 plus CRLF written to
 *   COM_RECEIVE (3ab10120), not the classic COMMAND characteristic.
 * - `raiseEvent 100` turns that indication stream on. Subscribing alone is
 *   not enough on an X3. `raiseEvent 10` fires a measurement on an X3.
 *   `raiseEvent 12` is not sent: on an X3 it returns error 245 and stops
 *   reporting for the rest of the session. On D5/X6 it is firmware-dependent.
 * - P2P bytes, verified against a Leica desktop XYZ export on an X3 + DST 360
 *   (agreement within 2.5 mm): azimuth and zenith as little-endian floats in
 *   radians. Zenith is measured down from vertical. The low byte of the
 *   trailing timestamp word pairs a P2P packet with its basic packet; the
 *   high byte is flags and differs between the two characteristics (0xc0 vs
 *   0x90), so the full words never match.
 *
 * The X6 follows that desktop-software path, but these bytes were captured on
 * a D2/D2G and an X3, not on an X6. See the README.
 */

export const DISTO_SERVICE = '3ab10100-f831-4395-b29d-570977d5bf94';

export const UUID = {
  service: DISTO_SERVICE,
  distance: '3ab10101-f831-4395-b29d-570977d5bf94',
  inclination: '3ab10103-f831-4395-b29d-570977d5bf94',
  commandClassic: '3ab10109-f831-4395-b29d-570977d5bf94',
  model: '3ab1010c-f831-4395-b29d-570977d5bf94',
  basic: '3ab1010d-f831-4395-b29d-570977d5bf94',
  p2p: '3ab1010f-f831-4395-b29d-570977d5bf94',
  comReceive: '3ab10120-f831-4395-b29d-570977d5bf94',
  comTransmit: '3ab10121-f831-4395-b29d-570977d5bf94',
  batteryService: '0000180f-0000-1000-8000-00805f9b34fb',
  battery: '00002a19-0000-1000-8000-00805f9b34fb',
};

/** Sent once after subscribe. Required before an X3-family laser will indicate. */
export const ENABLE_REPORTING = 'raiseEvent 100';
/** Remote trigger. Verified on an X3; the same command the desktop app sends for this family. */
export const REMOTE_MEASURE = 'raiseEvent 10';
export const QUERY_VERSION = 'getSoftwareVersion app';

/** Commands this app is willing to write. `raiseEvent 12` is deliberately absent. */
export const COMMANDS_SENT = [ENABLE_REPORTING, REMOTE_MEASURE, QUERY_VERSION];

const encoder = new TextEncoder();

export function frameCommand(command) {
  return encoder.encode(`${command}\r\n`);
}

export function asView(bytes) {
  if (bytes instanceof DataView) return bytes;
  if (bytes instanceof ArrayBuffer) return new DataView(bytes);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

export function metresToMm(metres) {
  if (!Number.isFinite(metres)) return null;
  return Math.round(metres * 1000);
}

/**
 * BASIC_MEASUREMENT_VALUES, 20 bytes.
 * distance and inclination are the wire values: metres and radians.
 * Inclination is the angle from horizontal (0 level, +π/2 straight up),
 * matching the degrees on the laser's display.
 */
export function decodeBasic(bytes) {
  const view = asView(bytes);
  if (view.byteLength < 20) return null;
  const timestamp = view.getUint16(18, true);
  return {
    distanceM: view.getFloat32(0, true),
    inclinationRad: view.getFloat32(4, true),
    directionRad: view.getFloat32(8, true),
    distanceUnit: view.getUint16(12, true),
    inclinationUnit: view.getUint16(14, true),
    directionUnit: view.getUint16(16, true),
    counter: timestamp & 0xff,
    flags: timestamp >> 8,
  };
}

/**
 * P2P_MEASUREMENTS, 12 bytes. Angles in radians.
 * Zenith is down from vertical: 0 straight up, π/2 horizontal, π straight down.
 */
export function decodeP2P(bytes) {
  const view = asView(bytes);
  if (view.byteLength < 12) return null;
  const timestamp = view.getUint16(10, true);
  return {
    azimuthRad: view.getFloat32(0, true),
    zenithRad: view.getFloat32(4, true),
    inclinationStatus: view.getUint16(8, true),
    counter: timestamp & 0xff,
    flags: timestamp >> 8,
  };
}

export function encodeBasic({
  distanceM,
  inclinationRad = 0,
  directionRad = 0,
  distanceUnit = 0,
  inclinationUnit = 1,
  directionUnit = 0,
  counter = 1,
  flags = 0xc0,
}) {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setFloat32(0, distanceM, true);
  view.setFloat32(4, inclinationRad, true);
  view.setFloat32(8, directionRad, true);
  view.setUint16(12, distanceUnit, true);
  view.setUint16(14, inclinationUnit, true);
  view.setUint16(16, directionUnit, true);
  view.setUint16(18, ((flags & 0xff) << 8) | (counter & 0xff), true);
  return bytes;
}

export function encodeP2P({
  azimuthRad,
  zenithRad,
  inclinationStatus = 1,
  counter = 1,
  flags = 0x90,
}) {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setFloat32(0, azimuthRad, true);
  view.setFloat32(4, zenithRad, true);
  view.setUint16(8, inclinationStatus, true);
  view.setUint16(10, ((flags & 0xff) << 8) | (counter & 0xff), true);
  return bytes;
}

function anglesUseful(p2p) {
  if (!p2p) return false;
  return Math.abs(p2p.azimuthRad) > 1e-4 || Math.abs(p2p.zenithRad) > 1e-4;
}

/**
 * One shot. Horizontal and vertical come from the laser's own tilt
 * (inclination from horizontal), which does not need the stand.
 * Stand angles are kept only when the P2P packet is not the all-zero
 * placeholder a read returns with no adapter fitted.
 */
export function combine(basic, p2p) {
  const distanceM = basic.distanceM;
  const inclinationRad = basic.inclinationRad || 0;
  const useful = anglesUseful(p2p);
  return {
    distanceM,
    inclinationRad,
    azimuthRad: useful ? p2p.azimuthRad : null,
    zenithRad: useful ? p2p.zenithRad : null,
    horizontalM: distanceM * Math.cos(inclinationRad),
    verticalM: distanceM * Math.sin(inclinationRad),
    hasStand: useful,
    counter: basic.counter ?? null,
  };
}

/** Instrument-centred point. Same spherical conversion Leica's desktop export uses. */
export function shotToInstrument(distanceM, azimuthRad, zenithRad) {
  const radius = distanceM * Math.sin(zenithRad);
  return {
    x: radius * Math.cos(azimuthRad),
    y: radius * Math.sin(azimuthRad),
    z: distanceM * Math.cos(zenithRad),
  };
}

/** Distance between two stand shots, in metres. The stand must not move. */
export function spanBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return {
    distanceM: Math.hypot(dx, dy, dz),
    horizontalM: Math.hypot(dx, dy),
    verticalM: dz,
  };
}

/**
 * Pairs P2P and basic indications that share a timestamp low byte.
 * P2P usually arrives first, about a tenth of a second ahead of basic.
 */
export function createAssembler(onMeasurement) {
  const pending = new Map();

  function flush(key) {
    const slot = pending.get(key);
    if (!slot || slot.done || !slot.basic) return false;
    slot.done = true;
    pending.delete(key);
    onMeasurement(combine(slot.basic, slot.p2p || null));
    return true;
  }

  function arm(key) {
    const slot = pending.get(key);
    if (!slot || slot.timer || slot.p2p) return;
    const timer = setTimeout(() => flush(key), 250);
    timer.unref?.();
    slot.timer = timer;
  }

  function push(key, patch, schedule) {
    const slot = pending.get(key) || { basic: null, p2p: null, done: false, timer: null };
    Object.assign(slot, patch);
    pending.set(key, slot);
    if (slot.basic && slot.p2p) {
      if (slot.timer) clearTimeout(slot.timer);
      flush(key);
      return;
    }
    if (schedule && slot.basic) arm(key);
  }

  return {
    pushBasic(bytes, { schedule = true } = {}) {
      const basic = bytes?.distanceM != null ? bytes : decodeBasic(bytes);
      if (!basic) return;
      push(basic.counter, { basic }, schedule);
    },
    pushP2P(bytes) {
      const p2p = bytes?.azimuthRad != null ? bytes : decodeP2P(bytes);
      if (!p2p) return;
      push(p2p.counter, { p2p }, false);
    },
    flush,
  };
}
