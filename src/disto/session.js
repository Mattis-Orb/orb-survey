import {
  COMMANDS_SENT,
  ENABLE_REPORTING,
  QUERY_VERSION,
  REMOTE_MEASURE,
  UUID,
  createAssembler,
  encodeBasic,
  encodeP2P,
  frameCommand,
  metresToMm,
  shotToInstrument,
  spanBetween,
} from './protocol.js';

/**
 * Live DISTO session. Web Bluetooth on Chrome for Android.
 * Decoding lives in protocol.js so a simulated laser runs the same bytes.
 */

const listeners = new Set();

export const disto = {
  status: 'off',
  deviceName: '',
  model: '',
  firmware: '',
  battery: null,
  stand: false,
  last: null,
  pointA: null,
  pointB: null,
  span: null,
  offsetMm: 0,
  error: '',
  sim: {
    mm: 2450,
    tiltDeg: 0,
    useStand: false,
    azimuthDeg: 0,
    zenithDeg: 90,
  },
};

let device = null;
let hookedDevice = null;
let commandChar = null;
let userDisconnected = false;
let reconnectTimer = null;
let shotSeq = 0;
let simCounter = 0;
let lastPublishedCounter = null;
let lastPublishedAt = 0;

function emit(event) {
  for (const listener of listeners) listener(event);
}

export function onDisto(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function textFromView(view) {
  return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

function publish(measurement) {
  const now = Date.now();
  if (
    measurement.counter != null
    && measurement.counter === lastPublishedCounter
    && now - lastPublishedAt < 1500
  ) {
    return;
  }
  lastPublishedCounter = measurement.counter;
  lastPublishedAt = now;
  const reading = {
    id: ++shotSeq,
    mm: metresToMm(measurement.distanceM),
    horizontalMm: metresToMm(measurement.horizontalM),
    verticalMm: metresToMm(measurement.verticalM),
    inclinationDeg: measurement.inclinationRad * (180 / Math.PI),
    azimuthDeg: measurement.azimuthRad == null ? null : measurement.azimuthRad * (180 / Math.PI),
    zenithDeg: measurement.zenithRad == null ? null : measurement.zenithRad * (180 / Math.PI),
    hasStand: measurement.hasStand,
    instrument: measurement.hasStand
      ? shotToInstrument(measurement.distanceM, measurement.azimuthRad, measurement.zenithRad)
      : null,
  };
  disto.last = reading;
  if (measurement.hasStand) disto.stand = true;
  emit('shot');
}

const assembler = createAssembler(publish);

function onBasic(view) {
  assembler.pushBasic(view);
}

function onP2P(view) {
  assembler.pushP2P(view);
}

function onLegacyDistance(view) {
  if (view.byteLength < 4) return;
  const distanceM = view.getFloat32(0, true);
  const inclinationRad = legacyInclination;
  publish({
    distanceM,
    inclinationRad,
    azimuthRad: null,
    zenithRad: null,
    horizontalM: distanceM * Math.cos(inclinationRad),
    verticalM: distanceM * Math.sin(inclinationRad),
    hasStand: false,
    counter: null,
  });
}

let legacyInclination = 0;

function onLegacyInclination(view) {
  if (view.byteLength < 4) return;
  legacyInclination = view.getFloat32(0, true);
}

function onCommandText(view) {
  const text = textFromView(view).trim();
  const version = text.match(/getSoftwareVersion:\s*(\S+)/i);
  if (version) {
    disto.firmware = version[1];
    emit('status');
  }
}

async function writeCommand(characteristic, command) {
  if (!COMMANDS_SENT.includes(command)) {
    throw new Error(`Refusing to send ${command}`);
  }
  const data = frameCommand(command);
  try {
    await characteristic.writeValue(data);
  } catch {
    await characteristic.writeValueWithoutResponse(data);
  }
}

function listen(characteristic, handler) {
  characteristic.addEventListener('characteristicvaluechanged', () => {
    try {
      handler(characteristic.value);
    } catch (error) {
      console.error(error);
    }
  });
  return characteristic.startNotifications();
}

async function readBattery(server) {
  try {
    const service = await server.getPrimaryService(UUID.batteryService);
    const characteristic = await service.getCharacteristic(UUID.battery);
    const value = await characteristic.readValue();
    disto.battery = value.getUint8(0);
    characteristic.addEventListener('characteristicvaluechanged', () => {
      disto.battery = characteristic.value.getUint8(0);
      emit('status');
    });
    await characteristic.startNotifications().catch(() => {});
  } catch {
    disto.battery = null;
  }
}

function findChar(map, uuid) {
  return map.get(uuid.toLowerCase()) || null;
}

async function connectGatt(nextDevice) {
  userDisconnected = false;
  device = nextDevice;
  disto.deviceName = nextDevice.name || 'DISTO';
  disto.status = disto.status === 'reconnecting' ? 'reconnecting' : 'connecting';
  disto.error = '';
  emit('status');

  if (hookedDevice !== nextDevice) {
    hookedDevice?.removeEventListener('gattserverdisconnected', onDisconnect);
    hookedDevice = nextDevice;
    nextDevice.addEventListener('gattserverdisconnected', onDisconnect);
  }
  const server = await nextDevice.gatt.connect();
  const service = await server.getPrimaryService(UUID.service);
  const characteristics = await service.getCharacteristics();
  const byUuid = new Map(characteristics.map((item) => [item.uuid.toLowerCase(), item]));

  const modelChar = findChar(byUuid, UUID.model);
  if (modelChar) {
    try {
      disto.model = textFromView(await modelChar.readValue()).replace(/\0/g, '').trim();
    } catch {
      disto.model = '';
    }
  }

  const basic = findChar(byUuid, UUID.basic);
  const p2p = findChar(byUuid, UUID.p2p);
  const distance = findChar(byUuid, UUID.distance);
  const inclination = findChar(byUuid, UUID.inclination);
  const comReceive = findChar(byUuid, UUID.comReceive);
  const comTransmit = findChar(byUuid, UUID.comTransmit);
  commandChar = comReceive;

  if (basic) await listen(basic, onBasic);
  if (p2p) await listen(p2p, onP2P);
  if (!basic && distance) await listen(distance, onLegacyDistance);
  if (!basic && inclination) await listen(inclination, onLegacyInclination);
  if (comTransmit) await listen(comTransmit, onCommandText).catch(() => {});

  if (comReceive) {
    await writeCommand(comReceive, ENABLE_REPORTING);
    await writeCommand(comReceive, QUERY_VERSION).catch(() => {});
  }

  await readBattery(server);
  disto.status = 'connected';
  emit('status');
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  let attempt = 0;
  const tick = async () => {
    if (userDisconnected || !device) return;
    attempt += 1;
    if (attempt > 8) {
      disto.status = 'off';
      disto.error = 'The DISTO disconnected. Tap connect to try again.';
      emit('status');
      return;
    }
    try {
      await connectGatt(device);
    } catch {
      reconnectTimer = setTimeout(tick, Math.min(8000, 600 * 2 ** attempt));
    }
  };
  reconnectTimer = setTimeout(tick, 700);
}

function onDisconnect() {
  commandChar = null;
  if (userDisconnected) {
    disto.status = 'off';
    emit('status');
    return;
  }
  disto.status = 'reconnecting';
  emit('status');
  scheduleReconnect();
}

export async function autoReconnect() {
  if (!navigator.bluetooth) {
    disto.status = 'unavailable';
    emit('status');
    return;
  }
  if (!navigator.bluetooth.getDevices) return;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const found = devices.find((item) => /DISTO/i.test(item.name || ''));
    if (found) await connectGatt(found);
  } catch {
    // Out of range on launch is normal. The connect button is still there.
  }
}

export async function requestDevice() {
  if (!navigator.bluetooth) {
    disto.status = 'unavailable';
    emit('status');
    throw new Error('Bluetooth needs Chrome on Android, opened from the installed app or the https site.');
  }
  stopSimulate();
  const next = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: 'DISTO' },
      { services: [UUID.service] },
    ],
    optionalServices: [UUID.service, UUID.batteryService],
  });
  await connectGatt(next);
}

export function disconnectDevice() {
  userDisconnected = true;
  clearTimeout(reconnectTimer);
  try {
    device?.gatt?.disconnect();
  } catch {
    // already gone
  }
  device = null;
  commandChar = null;
  disto.status = 'off';
  disto.model = '';
  disto.firmware = '';
  disto.battery = null;
  disto.error = '';
  emit('status');
}

export async function remoteMeasure() {
  if (!commandChar) throw new Error('Connect the DISTO first.');
  await writeCommand(commandChar, REMOTE_MEASURE);
}

export function startSimulate() {
  if (disto.status === 'connected' || disto.status === 'connecting' || disto.status === 'reconnecting') {
    disconnectDevice();
  }
  disto.status = 'simulated';
  disto.deviceName = 'Simulated DISTO X6';
  disto.model = 'X6 (simulated)';
  disto.error = '';
  emit('status');
}

export function stopSimulate() {
  if (disto.status !== 'simulated') return;
  disto.status = navigator.bluetooth ? 'off' : 'unavailable';
  disto.model = '';
  disto.deviceName = '';
  emit('status');
}

export function simulateShot() {
  if (disto.status !== 'simulated') startSimulate();
  const distanceM = Number(disto.sim.mm) / 1000;
  const inclinationRad = (Number(disto.sim.tiltDeg) || 0) * (Math.PI / 180);
  const counter = (simCounter = (simCounter + 1) & 0xff);
  const basic = encodeBasic({ distanceM, inclinationRad, counter, distanceUnit: 0 });
  if (disto.sim.useStand) {
    const p2p = encodeP2P({
      azimuthRad: (Number(disto.sim.azimuthDeg) || 0) * (Math.PI / 180),
      zenithRad: (Number(disto.sim.zenithDeg) || 0) * (Math.PI / 180),
      counter,
    });
    assembler.pushP2P(p2p);
    assembler.pushBasic(basic);
    return;
  }
  assembler.pushBasic(basic, { schedule: false });
  assembler.flush(counter);
}

export function markPoint(which) {
  if (!disto.last?.instrument) return false;
  const point = { ...disto.last.instrument, mm: disto.last.mm };
  if (which === 'A') {
    disto.pointA = point;
    disto.pointB = null;
    disto.span = null;
  } else {
    disto.pointB = point;
  }
  if (disto.pointA && disto.pointB) {
    const span = spanBetween(disto.pointA, disto.pointB);
    disto.span = {
      distanceMm: metresToMm(span.distanceM),
      horizontalMm: metresToMm(span.horizontalM),
      verticalMm: metresToMm(span.verticalM),
    };
  }
  emit('status');
  return true;
}

export function clearSpan() {
  disto.pointA = null;
  disto.pointB = null;
  disto.span = null;
  emit('status');
}

export function setOffset(mm) {
  disto.offsetMm = Number.isFinite(mm) ? Math.round(mm) : 0;
  emit('status');
}

export function fromFloorMm(reading = disto.last) {
  if (!reading || reading.verticalMm == null) return null;
  return reading.verticalMm + (Number(disto.offsetMm) || 0);
}

export function readingValue(which, reading = disto.last) {
  if (!reading && which !== 'span') return null;
  if (which === 'distance') return reading?.mm ?? null;
  if (which === 'horizontal') return reading?.horizontalMm ?? null;
  if (which === 'vertical') return reading?.verticalMm ?? null;
  if (which === 'floor') return fromFloorMm(reading);
  if (which === 'span') return disto.span?.distanceMm ?? null;
  return null;
}
