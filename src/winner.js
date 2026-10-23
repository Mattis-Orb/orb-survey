/** Pull a plot name out of Compusoft WINNER PDF text. No PDF library here. */

function cleanup(value) {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').replace(/[\s,]+$/g, '').trim();
  return text ? text.slice(0, 140) : null;
}

export function parseWinnerText(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  let designName = null;
  const design = flat.match(
    /Design:\s*(.+?)(?:\s+-\s+Wall\b|\s+\d{2}[./-]\d{2}[./-]\d{4}|\s+Printed:|$)/i,
  );
  if (design) designName = cleanup(design[1]);
  if (!designName) {
    const plan = flat.match(/Plan view:\s*[0-9]+(?:\/[0-9A-Za-z]+)+\s+(.+?)(?:\s+Printed:|$)/i);
    if (plan) designName = cleanup(plan[1]);
  }

  let projectName = null;
  const project = flat.match(/Project:\s*(.+?)(?:\s+Design:|\s+Printed:|\s+Scale:|$)/i);
  if (project) projectName = cleanup(project[1]);

  const numbered = flat.match(/Project number:\s*([0-9]+(?:\/[0-9A-Za-z]+)+)/i);
  const bare = flat.match(/\b(\d{3,}\/\d+\/\d+)\b/);
  const projectNumber = (numbered?.[1] || bare?.[1] || '').trim() || null;

  return { designName, projectName, projectNumber };
}

export function mergeWinner(texts) {
  const merged = { designName: null, projectName: null, projectNumber: null };
  for (const text of texts) {
    const parsed = parseWinnerText(text);
    for (const key of Object.keys(merged)) {
      if (!merged[key] && parsed[key]) merged[key] = parsed[key];
    }
  }
  return merged;
}

export function pageKind(text) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  if (/Perspective drawing/i.test(flat)) return { kind: 'perspective', label: 'Perspective' };
  if (/Elevation/i.test(flat)) {
    const wall = flat.match(/Wall\s*-\s*(\d+)/i);
    return { kind: 'elevation', label: wall ? `Wall ${wall[1]}` : 'Elevation' };
  }
  if (/Plan view/i.test(flat)) return { kind: 'plan', label: 'Plan' };
  return { kind: 'other', label: 'Page' };
}

export function labelPages(texts) {
  const pages = texts.map((text, index) => {
    const kind = pageKind(text);
    return { index: index + 1, kind: kind.kind, label: kind.label };
  });
  let planCount = 0;
  for (const page of pages) {
    if (page.kind === 'other') page.label = `Page ${page.index}`;
    if (page.kind === 'plan') {
      planCount += 1;
      page.label = planCount === 1 ? 'Plan' : `Plan ${planCount}`;
    }
  }
  return pages;
}

export function defaultPage(pages) {
  const plan = pages.find((page) => page.kind === 'plan');
  if (plan) return plan.index;
  return pages.length >= 2 ? 2 : 1;
}

export function nameFromFilename(filename) {
  const base = String(filename || '')
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return base || 'Plot';
}
