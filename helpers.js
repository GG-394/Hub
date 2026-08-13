// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  const n = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export function yearOf(iso) {
  return iso ? Number(iso.slice(0, 4)) : null;
}

/** "15–18 May 2025", "28 Aug – 29 Sep 2017", "May 2025" when we only have a month */
export function dateRange(start, end) {
  const s = parseISO(start);
  if (!s) return '';
  const e = parseISO(end);
  if (!e) return `${MONTHS_SHORT[s.getMonth()]} ${s.getFullYear()}`;

  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS_SHORT[s.getMonth()]} ${s.getFullYear()}`;
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]}${sameYear ? '' : ` ${s.getFullYear()}`}`;
  const right = `${e.getDate()} ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
  return `${left} – ${right}`;
}

export function nightsBetween(start, end) {
  const s = parseISO(start);
  const e = parseISO(end);
  if (!s || !e) return null;
  return Math.round((e - s) / 86400000);
}

export function daysUntil(iso) {
  const t = parseISO(todayISO());
  const d = parseISO(iso);
  if (!d) return null;
  return Math.round((d - t) / 86400000);
}

/** "Thu 15 May" — used as a fallback label when a day has a date but no label */
export function dayHeading(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${wd} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

/**
 * "Dinner @ Jolesch" -> "Jolesch". Keeps the whole string when there's no "@",
 * because "Howth cliff walk" is itself the searchable thing.
 */
export function placeName(title) {
  if (!title) return '';
  const parts = title.split(/\s+@\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

/**
 * A stored maps_url always wins (it came from a Maps share sheet, so it's exact).
 * Otherwise build a search URL from the place name plus whatever city we know.
 */
export function mapsUrl(item, city) {
  if (item.maps_url) return item.maps_url;
  const q = [placeName(item.title), city].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Items where a map link is useful. Travel and one-off notes aren't places. */
export function isMappable(item) {
  if (item.maps_url) return true;
  if (item.kind === 'travel') return false;
  const t = item.title.toLowerCase();
  if (t.length < 3) return false;
  if (/^(lie in|early night|chill|chill day|recovery|rest|lie-in|pack|packing)\b/.test(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Item kinds
// ---------------------------------------------------------------------------

export const KINDS = {
  food: { label: 'Food', glyph: '◆' },
  drink: { label: 'Drink', glyph: '●' },
  activity: { label: 'Activity', glyph: '○' },
  travel: { label: 'Travel', glyph: '→' },
  stay: { label: 'Stay', glyph: '▲' },
  other: { label: 'Other', glyph: '·' },
};

const FOOD = /^(dinner|lunch|breakfast|brunch|supper|food|eat|pizza|shake|cookies|dessert|coffee|cake|snack|pastels|pastries)\b/i;
const DRINK = /^(drinks?|cocktails?|beers?|wine|pint|bar\b|out\b|bno|mno|afters|bender|pub|night out)\b/i;
const TRAVEL = /^(fly|flight|train|transfer|drive|bus|coach|ferry|taxi|arrive|depart|to airport|travel|overnight bus|overnight coach)\b/i;
const STAY = /\b(hotel|hostel|guesthouse|airbnb|apartments?|inn|lodge|camp|gaff)\b/i;

export function classifyKind(title) {
  const t = (title || '').trim();
  if (FOOD.test(t)) return 'food';
  if (DRINK.test(t)) return 'drink';
  if (TRAVEL.test(t)) return 'travel';
  if (STAY.test(t)) return 'stay';
  return 'activity';
}

// ---------------------------------------------------------------------------
// Bullet parsing — the same rules used for the Google Docs import, so pasting
// an old itinerary in behaves identically to what's already in the archive.
// ---------------------------------------------------------------------------

const TIME_RE = /\b(\d{1,2}(?:[.:]\d{2})?\s*(?:AM|PM|am|pm))\b|\b(\d{1,2}[.:]\d{2})\b/;
const MAPS_LINK_RE = /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)\S*)/i;

/** Pull "Jolesch" out of a /place/Jolesch/@52.49... style URL */
function nameFromMapsUrl(url) {
  const m = url.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || null;
}

/**
 * Splits one line into its parts.
 *   "Dinner @ Kink, 8.30PM - great food"  ->  title / time / notes
 * A time is only recognised after a comma, so "Hyrox until 1pm" stays intact.
 * A pasted Maps share ("Jolesch\nhttps://maps.app.goo.gl/x") keeps the link.
 */
export function parseLine(raw) {
  let s = (raw || '').trim();
  let maps_url = null;

  const link = s.match(MAPS_LINK_RE);
  if (link) {
    maps_url = link[1];
    s = s.replace(MAPS_LINK_RE, '').trim();
    s = s.replace(/[–—-]\s*$/, '').trim();
    if (!s) s = nameFromMapsUrl(maps_url) || 'Untitled';
  }

  let notes = null;
  const dash = s.split(/\s+[-–]\s+/);
  if (dash.length > 1) {
    const tail = dash.slice(1).join(' - ');
    if (tail.length < 90) {
      s = dash[0].trim();
      notes = tail.trim();
    }
  }

  let time_label = null;
  const tm = s.match(TIME_RE);
  if (tm && /,\s*$/.test(s.slice(0, tm.index))) {
    time_label = (tm[1] || tm[2]).trim();
    s = (s.slice(0, tm.index) + s.slice(tm.index + tm[0].length))
      .replace(/,\s*(?=@)/, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[,@]\s*$/, '')
      .trim();
  }

  return { title: s, time_label, notes, maps_url, kind: classifyKind(s) };
}

/**
 * Turns the editor's text into rows. Two leading spaces (one indent level)
 * makes a sub-bullet of whatever came above it.
 */
export function parseBullets(text) {
  const out = [];
  const lastAtDepth = {};

  (text || '').split('\n').forEach((line) => {
    if (!line.trim()) return;
    const indent = line.match(/^ */)[0].length;
    const depth = Math.min(Math.floor(indent / 2), 1);
    const body = line.replace(/^\s*(?:[-•*]\s*)?/, '').trim();
    if (!body) return;

    const parsed = parseLine(body);
    if (!parsed.title) return;

    const row = { ...parsed, depth, parentIndex: depth > 0 ? lastAtDepth[0] : null };
    out.push(row);
    lastAtDepth[depth] = out.length - 1;
  });

  return out;
}

/** The reverse: existing rows back into editable bullet text. */
export function itemsToText(items) {
  const byParent = new Map();
  items.forEach((i) => {
    const k = i.parent_id || '__root';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(i);
  });
  const sortRows = (rows) => rows.sort((a, b) => a.sort_order - b.sort_order);

  const lines = [];
  const write = (row, depth) => {
    let s = row.title;
    if (row.time_label) s += `, ${row.time_label}`;
    if (row.notes) s += ` - ${row.notes}`;
    if (row.maps_url) s += ` ${row.maps_url}`;
    lines.push(`${'  '.repeat(depth)}- ${s}`);
    sortRows(byParent.get(row.id) || []).forEach((c) => write(c, depth + 1));
  };
  sortRows(byParent.get('__root') || []).forEach((r) => write(r, 0));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Countries — stored as "Peru; Bolivia" so multi-country trips count properly
// ---------------------------------------------------------------------------

export function countriesOf(trip) {
  if (!trip.country) return [];
  return trip.country
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean);
}
