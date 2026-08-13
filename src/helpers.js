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
// Google Maps — only link things that are actually places
// ---------------------------------------------------------------------------

// Words that mean "not a specific findable place"
const GENERIC = /\b(hotel|gaff|home|accom|accommodation|apartment|airbnb|hostel|food truck|non-descript|locally|nearby|somewhere|the place|airport|pool|gym|sports bar|our place|the flat|room|restaurant near|bar near|place near|old town|walking tour|day trip|training)\b/i;

// A bare category is not a place
const BARE = /^(restaurant|bar|cafe|pub|club|market|beach|park|dinner|lunch|breakfast|brunch|shake|coffee|drinks?|the strip|lie in|early night|chill|rest|recovery|pack|packing|lie-in|shopping|swim|run|golf|padel)$/i;

// Filler activities that never map
const NON_PLACE = /^(lie in|lie-in|early night|chill|chill day|chill night|recovery|rest|pack|packing|fishing|swim|run|nap|gym|shopping|beach day|travel day|bender)\b/i;

const FOOD_AT = /^(?:dinner|lunch|breakfast|brunch|supper|drinks?|cocktails?|coffee|shake|post-dins|snack)\s+(?:at|in)\s+(.+)$/i;
const PLACE_AT = /^(?:travel to|trip to|night in|day in|explore|shopping in|visit)\s+(.+)$/i;

/**
 * The thing to search for, or null when this line isn't a place.
 * Deliberately conservative — a wrong link is more annoying than a missing one.
 */
export function placeName(title) {
  if (!title) return '';
  const parts = (title || '').split(/\s+@\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

export function mapsTarget(item) {
  if (item.maps_url) return item.title;

  let s = (item.title || '').trim();

  if (s.includes(' / ')) return null;              // compound line
  if (/[>â†’]/.test(s) || s.includes('->')) return null; // a route, not a place
  if (s.split(/\s+/).length > 7) return null;      // a sentence
  if (NON_PLACE.test(s)) return null;

  const hasVenue = s.includes(' @ ');
  if (item.kind === 'travel' && !hasVenue) return null;

  if (hasVenue) s = s.split(' @ ').pop().trim();
  else {
    const m = s.match(FOOD_AT) || s.match(PLACE_AT);
    if (m) s = m[1].trim();
  }

  s = s.replace(/\s*\([^)]*\)\s*$/, '').replace(/[.,;:!?]+$/, '').trim();

  if (s.length < 3) return null;
  if (!/[A-Z]/.test(s)) return null;               // no proper noun, no link
  if (BARE.test(s)) return null;
  if (GENERIC.test(s)) return null;
  return s;
}

export function isMappable(item) {
  return mapsTarget(item) !== null;
}

export function mapsUrl(item, city) {
  if (item.maps_url) return item.maps_url;
  const t = mapsTarget(item);
  if (!t) return null;
  const q = [t, city].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// ---------------------------------------------------------------------------
// Trip cards — a handful of representative places, spread across the days
// ---------------------------------------------------------------------------

const TOWN_LEAD = /^(?:travel to|fly to|fly|train to|bus to|coach to|drive to|transfer to|transfer >|day trip to|trip to|night in|night at|day in|explore|arrive in|arrive|chill in|shopping in|visit|back to)\s+(.+)$/i;
const TOWN_ARROW = /(?:>|->|\u2192)\s*([A-Za-z][A-Za-z\s.'\u2019-]{2,})$/;
const DATEISH = /^(?:mon|tue|wed|thu|fri|sat|sun|day\s*\d)/i;
const TOWN_STOP = /\b(gaff|hotel|hostel|accom|accommodation|home|airport|apartment|airbnb|guesthouse|the boat|boat|bed|camp|ldn|work|gym|out|back|onwards|early|late|there|here|around|town|city|the strip|local|locally|nearby|skiing|restaurant|dinner|lunch|breakfast)\b/i;

function titleish(s) {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Town or city named by a line like "night in Vik" or "Early train > Seoul". */
function townFrom(item) {
  let s = (item.title || '').trim();
  if (DATEISH.test(s)) return null;
  if (s.includes(' @ ')) return null;

  let m = s.match(TOWN_LEAD);
  let out = m ? m[1] : null;
  if (!out) {
    m = s.match(TOWN_ARROW);
    out = m ? m[1] : null;
  }
  if (!out) return null;

  out = out
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b\d{1,2}([.:]\d{2})?\s*(am|pm)\b/gi, ' ')
    .split(/\s+\/\s+|,|\s+\bor\b\s+/i)[0]
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/[>\u2192]/.test(out)) return null;             // still a route, not a place
  if (/\d/.test(out)) return null;                    // times, flight numbers
  if (out.length < 3 || out.length > 22) return null;
  if (out.split(/\s+/).length > 3) return null;
  if (TOWN_STOP.test(out)) return null;
  // airport codes and other all-caps shorthand
  if (out.split(/\s+/).some((w) => w.length <= 4 && w === w.toUpperCase() && /^[A-Z]+$/.test(w))) return null;
  return titleish(out);
}

/**
 * A few representative places for the card. Towns and cities first, since
 * that's the useful summary of where a trip actually went; venues only fill
 * the gap on single-city trips where there are no travel legs to read.
 */
export function tripPlaces(trip, limit = 5) {
  // A manual summary always wins — the heuristic below can't read every
  // itinerary style, so this is the escape hatch.
  if (trip.summary && trip.summary.trim()) {
    return trip.summary.split(/\s*[;\u00b7]\s*|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  }

  const own = new Set([trip.title, trip.city].filter(Boolean).map((s) => s.toLowerCase()));
  const days = [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const seen = new Set();
  const out = [];

  const add = (raw) => {
    if (!raw || out.length >= limit) return;
    const k = raw.toLowerCase();
    if (seen.has(k) || own.has(k)) return;
    seen.add(k);
    out.push(raw);
  };

  const allItems = [];
  days.forEach((d) => {
    if (d.city) add(d.city);
    [...(d.items || [])].sort((a, b) => a.sort_order - b.sort_order).forEach((i) => allItems.push(i));
  });

  allItems.forEach((i) => add(townFrom(i)));

  // Single-city trips have no travel legs to read, so fall back to the
  // named venues and landmarks instead.
  if (out.length < 3) {
    allItems.forEach((i) => {
      if (!i.title.includes(' @ ')) return;
      const t = mapsTarget(i);
      if (t && t.length <= 24 && !TOWN_STOP.test(t) && !/\d/.test(t)) add(t);
    });
  }
  if (out.length < 3) {
    allItems.forEach((i) => {
      const t = mapsTarget(i);
      if (t && t.length <= 24 && !TOWN_STOP.test(t) && !/\d/.test(t)) add(t);
    });
  }

  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Item kinds
// ---------------------------------------------------------------------------

const FOOD = /^(dinner|lunch|breakfast|brunch|supper|food|eat|pizza|shake|cookies|dessert|coffee|cake|snack|pastels|pastries|post-dins)\b/i;
const DRINK = /^(drinks?|cocktails?|beers?|wine|pint|bar\b|out\b|bno|mno|afters|bender|pub|night out)\b/i;
const TRAVEL = /^(fly|flight|train|transfer|drive|bus|coach|ferry|taxi|arrive|depart|to airport|travel|overnight bus|overnight coach)\b/i;
const STAY = /\b(hotel|hostel|guesthouse|airbnb|apartments?|inn|lodge|camp)\b/i;

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

function nameFromMapsUrl(url) {
  const m = url.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || null;
}

/**
 * Splits one line into its parts.
 *   "Dinner @ Kink, 8.30PM - great food"  ->  title / time / notes
 * A time is only recognised after a comma, so "Hyrox until 1pm" stays intact.
 */
export function parseLine(raw) {
  let s = (raw || '').trim();
  let maps_url = null;

  const link = s.match(MAPS_LINK_RE);
  if (link) {
    maps_url = link[1];
    s = s.replace(MAPS_LINK_RE, '').trim().replace(/[\u2013\u2014-]\s*$/, '').trim();
    if (!s) s = nameFromMapsUrl(maps_url) || 'Untitled';
  }

  let notes = null;
  const dash = s.split(/\s+[-\u2013]\s+/);
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

/** Editor text to rows. Two leading spaces makes a sub-bullet. */
export function parseBullets(text) {
  const out = [];
  const lastAtDepth = {};

  (text || '').split('\n').forEach((line) => {
    if (!line.trim()) return;
    const indent = line.match(/^ */)[0].length;
    const depth = Math.min(Math.floor(indent / 2), 1);
    const body = line.replace(/^\s*(?:[-\u2022*]\s*)?/, '').trim();
    if (!body) return;

    const parsed = parseLine(body);
    if (!parsed.title) return;

    out.push({ ...parsed, depth, parentIndex: depth > 0 ? lastAtDepth[0] : null });
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
