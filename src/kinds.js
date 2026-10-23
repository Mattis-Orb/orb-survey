export const KINDS = [
  {
    id: 'wall',
    label: 'Wall',
    short: 'Wall',
    mode: 'line',
    color: '#1f3d4d',
    hint: 'Drag along the wall, or tap one end and then the other.',
    fields: [
      { key: 'lengthMm', label: 'Length', short: 'Length', unit: 'mm', needed: true, primary: true },
    ],
  },
  {
    id: 'ceiling',
    label: 'Ceiling',
    short: 'Ceiling',
    mode: 'pin',
    color: '#1f7a4d',
    hint: 'Tap where you took the ceiling height.',
    fields: [
      {
        key: 'heightMm',
        label: 'Ceiling height',
        short: 'Height',
        unit: 'mm',
        needed: true,
        primary: true,
        prefer: 'vertical',
        hint: 'Stand the DISTO on the floor and shoot straight up. The number is then the floor-to-ceiling height.',
      },
    ],
  },
  {
    id: 'beam',
    label: 'Beam',
    short: 'Beam',
    mode: 'pin',
    color: '#c4542c',
    hint: 'Tap the beam, then measure along the wall, the width, and the height underneath.',
    fields: [
      { key: 'alongMm', label: 'Position along the wall', short: 'Along', unit: 'mm', needed: true },
      { key: 'widthMm', label: 'Beam width', short: 'Width', unit: 'mm', needed: true },
      {
        key: 'heightUnderMm',
        label: 'Height underneath',
        short: 'Under',
        unit: 'mm',
        needed: true,
        primary: true,
        prefer: 'vertical',
        hint: 'Shoot the underside. If the laser is on the stand, add the stand height in the DISTO panel for a floor height.',
      },
    ],
  },
  {
    id: 'bulkhead',
    label: 'Low ceiling',
    short: 'Low ceiling',
    mode: 'rect',
    color: '#c4542c',
    hint: 'Drag a box around the lowered ceiling.',
    fields: [
      {
        key: 'heightMm',
        label: 'Height in this zone',
        short: 'Height',
        unit: 'mm',
        needed: true,
        primary: true,
        prefer: 'vertical',
        hint: 'Ceiling height inside the lowered area.',
      },
    ],
  },
  {
    id: 'soil',
    label: 'Soil / waste',
    short: 'Soil',
    mode: 'pin',
    color: '#6b4c9a',
    hint: 'Tap the soil stack or waste.',
    fields: [],
  },
  {
    id: 'water',
    label: 'Water',
    short: 'Water',
    mode: 'pin',
    color: '#1d5c8a',
    hint: 'Tap the water feed.',
    fields: [],
  },
  {
    id: 'sink',
    label: 'Sink',
    short: 'Sink',
    mode: 'pin',
    color: '#0e7490',
    hint: 'Tap where the sink can go.',
    fields: [],
  },
  {
    id: 'electrics',
    label: 'Power',
    short: 'Power',
    mode: 'pin',
    color: '#b45309',
    hint: 'Tap a socket, switch, or spur.',
    fields: [
      {
        key: 'subtype',
        label: 'What is it?',
        type: 'choice',
        options: ['Socket', 'Switch', 'Spur', 'Other'],
        default: 'Socket',
      },
      { key: 'heightMm', label: 'Height from floor', short: 'Height', unit: 'mm', prefer: 'vertical' },
    ],
  },
  {
    id: 'opening',
    label: 'Window / door',
    short: 'Opening',
    mode: 'pin',
    color: '#3f6212',
    hint: 'Tap a window or a door.',
    fields: [
      { key: 'subtype', label: 'What is it?', type: 'choice', options: ['Window', 'Door'], default: 'Window' },
      { key: 'widthMm', label: 'Width', short: 'Width', unit: 'mm', needed: true },
      { key: 'heightMm', label: 'Height', short: 'Height', unit: 'mm', needed: true, primary: true },
      { key: 'sillMm', label: 'Sill height', short: 'Sill', unit: 'mm' },
    ],
  },
  {
    id: 'radiator',
    label: 'Radiator / boiler',
    short: 'Heat',
    mode: 'pin',
    color: '#9f1239',
    hint: 'Tap a radiator or the boiler.',
    fields: [
      {
        key: 'subtype',
        label: 'What is it?',
        type: 'choice',
        options: ['Radiator', 'Boiler'],
        default: 'Radiator',
      },
    ],
  },
  {
    id: 'note',
    label: 'Note',
    short: 'Note',
    mode: 'pin',
    color: '#44403c',
    hint: 'Tap to drop a note for the office.',
    fields: [],
  },
];

export const MOVE_TOOL = {
  id: 'move',
  label: 'Move',
  mode: 'move',
  hint: 'Drag to move around the plan. Pinch to zoom. Tap a mark to edit it.',
};

const BY_ID = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));

export function kindById(id) {
  return BY_ID[id] || KINDS[KINDS.length - 1];
}

export function tools() {
  return [MOVE_TOOL, ...KINDS];
}

export function defaultFields(kindId) {
  const fields = {};
  for (const field of kindById(kindId).fields) {
    if (field.default != null) fields[field.key] = field.default;
  }
  return fields;
}

export function missingLabels(entry) {
  const missing = [];
  for (const field of kindById(entry.kind).fields) {
    if (!field.needed) continue;
    const value = entry.fields?.[field.key];
    if (value == null || value === '') missing.push(field.short || field.label);
  }
  if (entry.kind === 'note' && !String(entry.note || '').trim()) missing.push('Note');
  return missing;
}

export function entrySummary(entry) {
  const kind = kindById(entry.kind);
  const bits = [];
  for (const field of kind.fields) {
    if (field.type === 'choice') {
      if (entry.fields?.[field.key]) bits.push(entry.fields[field.key]);
      continue;
    }
    const value = entry.fields?.[field.key];
    if (value == null || value === '') continue;
    const number = Math.round(Number(value)).toLocaleString('en-GB');
    bits.push(`${field.short || field.label} ${number}`);
  }
  if (entry.note && entry.kind !== 'note') bits.push(entry.note);
  if (entry.kind === 'note') return entry.note || 'Empty note';
  return bits.join(' · ') || 'No measurement yet';
}

export function pinCaption(entry) {
  const kind = kindById(entry.kind);
  const primary = kind.fields.find((field) => field.primary) || kind.fields.find((field) => field.unit === 'mm');
  const value = primary ? entry.fields?.[primary.key] : null;
  if (value == null || value === '') return kind.short;
  return `${kind.short} ${Math.round(Number(value)).toLocaleString('en-GB')}`;
}

export function toolIcon(id) {
  const paths = {
    move: '<path d="M12 2l2 6h-4zM12 22l-2-6h4zM2 12l6-2v4zM22 12l-6 2v-4z" fill="currentColor"/>',
    wall: '<path d="M3 16h18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    ceiling: '<path d="M4 9h16M12 9v11" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    beam: '<rect x="4" y="6" width="16" height="5" rx="1" fill="currentColor"/><path d="M8 14v6M16 14v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bulkhead: '<rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>',
    soil: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
    water: '<path d="M12 3s-6 8-6 12a6 6 0 0 0 12 0c0-4-6-12-6-12z" fill="currentColor"/>',
    sink: '<path d="M4 9h16M7 9v2a5 5 0 0 0 10 0V9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    electrics: '<path d="M13 2L6 13h5l-1 9 8-12h-5l1-8z" fill="currentColor"/>',
    opening: '<rect x="5" y="3" width="14" height="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v18" stroke="currentColor" stroke-width="2"/>',
    radiator: '<path d="M6 6v12M10 6v12M14 6v12M18 6v12M5 6h14M5 18h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    note: '<path d="M6 3h9l3 3v15H6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 3v4h4" fill="none" stroke="currentColor" stroke-width="2"/>',
  };
  return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${paths[id] || ''}</svg>`;
}
