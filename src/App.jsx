import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { COUNTRY_NAMES, countryCode } from './countries';
import { COUNTRY_PATHS, MAP_HEIGHT, MAP_WIDTH } from './worldPaths';
import {
  countriesOf,
  parseISO,
  dateRange,
  dayHeading,
  daysUntil,
  itemsToText,
  mapsUrl,
  nightsBetween,
  parseBullets,
  todayISO,
  yearOf,
} from './helpers';

/* ==========================================================================
   Error boundary — a render exception would otherwise leave a blank screen
   with the reason only visible in the browser console.
   ========================================================================== */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Hub crashed while rendering:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen px-6 pt-16" style={{ backgroundColor: 'var(--cream)' }}>
        <p className="hub-eyebrow mb-3">Something broke</p>
        <h1 className="hub-display text-3xl mb-4">Hub hit an error</h1>
        <pre
          className="text-xs leading-relaxed p-3 mb-4"
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            backgroundColor: 'rgba(255,255,255,0.5)',
            border: '1px solid var(--navy-20)',
          }}
        >
          {String(this.state.error && (this.state.error.stack || this.state.error.message))}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium rounded-sm"
          style={{ backgroundColor: 'var(--navy)', color: 'var(--cream)' }}
        >
          Reload
        </button>
      </div>
    );
  }
}

/**
 * The places shown on a trip card.
 *
 * A manual summary always wins. Otherwise it's the distinct locations recorded
 * against the days, in visit order — which covers a freshly added trip where
 * the days were pre-populated with a destination.
 *
 * The one thing suppressed is pure redundancy: a single location identical to
 * the trip's own name, where the card would just repeat its title.
 */
function tripPlaces(trip) {
  // No cap: cards wrap to as many lines as they need rather than dropping
  // places off the end. A long trip legitimately has a long list.
  if (trip.summary && trip.summary.trim()) {
    return trip.summary
      .split(/\s*[;\u00b7]\s*|\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const days = [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const seq = [];
  days.forEach((d) => {
    const c = (d.city || '').trim();
    if (!c) return;
    if (seq.length && seq[seq.length - 1].toLowerCase() === c.toLowerCase()) return;
    seq.push(c);
  });

  const uniq = [...new Map(seq.map((s) => [s.toLowerCase(), s])).values()];

  if (uniq.length === 1 && uniq[0].toLowerCase() === (trip.title || '').trim().toLowerCase()) {
    return [];
  }
  return uniq;
}

/* ==========================================================================
   Date helpers — kept in this file rather than helpers.js so App.jsx can be
   updated on its own, without the two files having to move together.
   ========================================================================== */

/** The ISO date n days on from the given one. */
function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The ISO date one day on from the given one. */
function nextDay(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + 1);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Every ISO date from start to end inclusive, capped so a mistyped year
 *  can't generate thousands of rows. */
function datesBetween(start, end, cap = 90) {
  const s = parseISO(start);
  const e = parseISO(end) || s;
  if (!s) return [];
  const out = [];
  const d = new Date(s);
  while (d <= e && out.length < cap) {
    const p = (v) => String(v).padStart(2, '0');
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ==========================================================================
   Icons — small, consistent, stroked in the current text colour
   ========================================================================== */

const ICONS = {
  food:  { d: 'M7 3.5v17M5 3.5v4.5a2 2 0 0 0 4 0V3.5M16.5 3.5v17M16.5 3.5c2 1 2 5.5 0 6.5', mode: 'stroke' },
  drink: { d: 'M4 5.5h16l-8 8.5ZM12 14v5M8.5 19.5h7', mode: 'stroke' },
  plane: { d: 'M10.5 3.2a1.5 1.5 0 0 1 3 0V9l7.5 4.4v2.3L13.5 13.6v4.1l2.8 1.9v1.6L12 20l-4.3 1.2v-1.6l2.8-1.9v-4.1L3 15.7v-2.3L10.5 9Z', mode: 'fill' },
  route: { d: 'M6 4v9.5a4 4 0 0 0 4 4h7M14.5 14.5l3.5 3-3.5 3', mode: 'stroke' },
  stay:  { d: 'M3 18.5v-6h18v6M3 12.5V7m18 5.5v-3a2 2 0 0 0-2-2h-7v5M6.5 10h2.5', mode: 'stroke' },
  pin:   { d: 'M12 21.5C12 21.5 18.5 15 18.5 10.2A6.5 6.5 0 0 0 5.5 10.2C5.5 15 12 21.5 12 21.5Z', mode: 'fill' },
  dot:   { d: '', mode: 'dot' },
  link:  { d: 'M9.5 14.5 14.5 9.5M11 6.5 12.7 4.8a4 4 0 0 1 5.7 5.7l-1.7 1.7M13 17.5l-1.7 1.7a4 4 0 0 1-5.7-5.7l1.7-1.7', mode: 'stroke' },
  archive:  { d: 'M3.5 7.5h17v3.5h-17zM5.5 11v9h13v-9M9.5 14.5h5', mode: 'stroke' },
  calendar: { d: 'M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4', mode: 'stroke' },
  chart:    { d: 'M3.5 20.5h17M7 20.5v-6.5M12 20.5V6.5M17 20.5v-9.5', mode: 'stroke' },
  people:   { d: 'M2.5 20.5v-1.8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1.8M8.5 10.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M16.5 4.4a3.2 3.2 0 0 1 0 6.2M21.5 20.5v-1.8a4 4 0 0 0-3-3.85', mode: 'stroke' },
};

function Icon({ name, size = 14 }) {
  const icon = ICONS[name] || ICONS.dot;
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    'aria-hidden': true,
    style: { flexShrink: 0, display: 'block' },
  };

  if (icon.mode === 'dot') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    );
  }

  if (icon.mode === 'fill') {
    return (
      <svg {...common}>
        <path d={icon.d} fill="currentColor" />
        {name === 'pin' && <circle cx="12" cy="10" r="2.3" fill="var(--cream)" />}
      </svg>
    );
  }

  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={icon.d} />
    </svg>
  );
}

/** Icon for a line, based purely on what it is. Flights get a plane, other
 *  travel a route arrow, everything unclassified a pin. */
function iconFor(item) {
  const t = (item.title || '').toLowerCase();
  if (/\b(fly|flight|plane|airport)\b/.test(t)) return 'plane';
  if (item.kind === 'travel') return 'route';
  if (item.kind === 'food') return 'food';
  if (item.kind === 'drink') return 'drink';
  if (item.kind === 'stay') return 'stay';
  return 'pin';
}

/* ==========================================================================
   Brand
   ========================================================================== */

function Logo({ size = 24 }) {
  return (
    <svg viewBox="20 24 140 134" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <g fill="var(--amber)">
        <circle cx="34" cy="146" r="7" />
        <circle cx="60" cy="136" r="8" />
      </g>
      <g fill="var(--navy)" transform="rotate(-30 100 72)">
        <polygon points="148,72 128,63 100,60 72,62 62,66 59,72 62,78 72,82 100,84 128,81" />
        <polygon points="110,67 86,30 74,30 96,67" />
        <polygon points="110,77 86,114 74,114 96,77" />
      </g>
    </svg>
  );
}

function BrandBar() {
  return (
    <div
      className="flex items-center gap-2 px-5 shrink-0"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--navy-10)',
        backgroundColor: 'var(--cream)',
      }}
    >
      <Logo size={22} />
      <span
        className="hub-display"
        style={{ fontSize: '19px', letterSpacing: '0.02em', lineHeight: 1 }}
      >
        Hub
      </span>
    </div>
  );
}

/* ==========================================================================
   Shared pieces
   ========================================================================== */

function Spinner({ label = 'Loading' }) {
  return (
    <div className="py-16 text-center hub-faint text-sm" role="status">
      {label}…
    </div>
  );
}

function Button({ children, onClick, variant = 'solid', type = 'button', disabled }) {
  const styles =
    variant === 'solid'
      ? { backgroundColor: 'var(--navy)', color: 'var(--cream)' }
      : { backgroundColor: 'transparent', color: 'var(--navy)', border: '1px solid var(--navy-20)' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm font-medium rounded-sm transition-colors disabled:opacity-40"
      style={styles}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="hub-eyebrow block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/**
 * Emoji flags don't render on Windows or most desktop Chrome installs, so
 * these are images keyed off the ISO code instead.
 */
/**
 * A native date input with an explicit clear. iOS's own picker has a Reset
 * button that only resets the wheels — it never commits an empty value — so
 * this provides the one thing that actually works.
 */
function DateField({ label, value, onChange, min, max }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="hub-eyebrow">{label}</span>
        {value && (
          <button onClick={() => onChange('')} className="hub-faint text-xs underline">
            clear
          </button>
        )}
      </div>
      {/* A flex wrapper with min-width:0 is what actually constrains a native
          date input — it otherwise sizes to its intrinsic content width and
          ignores max-width. overflow:hidden is the backstop. */}
      <div style={{ display: 'flex', minWidth: 0, overflow: 'hidden' }}>
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          min={min || undefined}
          max={max || undefined}
          className="hub-input px-3 py-2"
          style={{ flex: '1 1 0%', minWidth: 0, width: '100%' }}
        />
      </div>
    </div>
  );
}

function Flag({ country, size = 18 }) {
  const code = countryCode(country);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={country}
      title={country}
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      style={{ borderRadius: '2px', display: 'block', border: '1px solid var(--navy-10)' }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

function Flags({ trip, size = 18 }) {
  const list = countriesOf(trip);
  if (!list.length) return null;
  return (
    <span className="flex items-center gap-1 shrink-0">
      {list.map((c) => (
        <Flag key={c} country={c} size={size} />
      ))}
    </span>
  );
}

/**
 * Editable chips. Used for companions and for the card summary, so both can be
 * pruned one tag at a time.
 */
// Group labels sit above individual names; everything else is alphabetical
const PINNED_TAGS = ['big group', 'solo'];

function byPerson(x, y) {
  const px = PINNED_TAGS.indexOf(x.toLowerCase());
  const py = PINNED_TAGS.indexOf(y.toLowerCase());
  if (px !== -1 || py !== -1) {
    if (px === -1) return 1;
    if (py === -1) return -1;
    return px - py;
  }
  return x.localeCompare(y, undefined, { sensitivity: 'base' });
}

function Tags({ value, onSave, placeholder, addLabel, reorder, sortAlpha, quickAdds }) {
  const raw = (value || '')
    .split(/\s*[;\u00b7]\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  // People read better alphabetically; summary tags keep the order you set.
  const list = sortAlpha ? [...raw].sort(byPerson) : raw;

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(null);      // live order during a drag
  const [dragIndex, setDragIndex] = useState(null);

  // Refs, because the window listeners below are registered once per drag and
  // would otherwise close over stale state.
  const orderRef = useRef(null);
  const indexRef = useRef(null);
  const movedRef = useRef(false);

  const shown = order || list;
  const commit = (next) => {
    onSave((sortAlpha ? [...next].sort(byPerson) : next).join(', '));
  };

  const canDrag = reorder && list.length > 1;

  function startDrag(e, index) {
    if (!canDrag) return;
    e.preventDefault();
    orderRef.current = [...list];
    indexRef.current = index;
    movedRef.current = false;
    setOrder([...list]);
    setDragIndex(index);
  }

  // Listeners go on the window rather than the chip: React re-creates the chip
  // nodes as the order changes mid-drag, which would drop element-bound events.
  useEffect(() => {
    if (dragIndex == null) return undefined;

    function onMove(e) {
      const point = e.touches ? e.touches[0] : e;
      const el = document.elementFromPoint(point.clientX, point.clientY);
      const chip = el && el.closest ? el.closest('[data-chip-index]') : null;
      if (!chip) return;
      const to = Number(chip.getAttribute('data-chip-index'));
      const from = indexRef.current;
      if (Number.isNaN(to) || to === from) return;

      const next = [...(orderRef.current || list)];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      orderRef.current = next;
      indexRef.current = to;
      movedRef.current = true;
      setOrder(next);
      setDragIndex(to);
    }

    function onEnd() {
      const next = orderRef.current;
      const changed = movedRef.current && next && next.join('\u0000') !== list.join('\u0000');
      orderRef.current = null;
      indexRef.current = null;
      setDragIndex(null);
      setOrder(null);
      if (changed) commit(next);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    // Safari on iOS still needs the touch pair when pointer events are patchy
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex == null, value]);

  function add() {
    const name = draft.trim().replace(/[,;]$/, '');
    if (!name) return;
    if (!list.some((p) => p.toLowerCase() === name.toLowerCase())) commit([...list, name]);
    setDraft('');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((p, i) => {
          const isDragging = dragIndex === i;
          return (
            <span
              key={p}
              data-chip-index={i}
              onPointerDown={(e) => startDrag(e, i)}
              onTouchStart={(e) => startDrag(e, i)}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm select-none"
              style={{
                backgroundColor: isDragging ? 'var(--navy-20)' : 'var(--navy-10)',
                cursor: canDrag ? 'grab' : 'default',
                touchAction: canDrag ? 'none' : 'auto',
                opacity: dragIndex != null && !isDragging ? 0.6 : 1,
                boxShadow: isDragging ? '0 1px 4px rgba(9,32,51,0.25)' : 'none',
              }}
            >
              {canDrag && (
                <span className="hub-faint" aria-hidden="true" style={{ fontSize: '10px', lineHeight: 1 }}>
                  ⠿
                </span>
              )}
              {p}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={() => commit(list.filter((x) => x !== p))}
                aria-label={`Remove ${p}`}
                className="hub-faint"
                style={{ lineHeight: 1, fontSize: '13px' }}
              >
                ×
              </button>
            </span>
          );
        })}

        {!open && (
          <button onClick={() => setOpen(true)} className="hub-faint text-xs underline">
            {list.length ? '+ add' : addLabel}
          </button>
        )}
        {!open &&
          (quickAdds || [])
            .filter((s) => !list.some((p) => p.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button
                key={s}
                onClick={() => commit([...list, s])}
                className="hub-faint text-xs underline"
              >
                {s}
              </button>
            ))}
      </div>

      {open && (
        <div className="mt-2">
          {/* input on its own line: three items side by side overflow a card */}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            autoFocus
            className="hub-input w-full px-2 py-1.5"
            style={{ minWidth: 0 }}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={add}
              className="px-3 py-1 text-xs font-medium rounded-sm"
              style={{ backgroundColor: 'var(--navy)', color: 'var(--cream)' }}
            >
              Add
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-xs font-medium rounded-sm"
              style={{ color: 'var(--navy)', border: '1px solid var(--navy-20)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Sign in
   ========================================================================== */

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'That email and password don\u2019t match.'
          : error.message
      );
    }
  }

  async function sendReset() {
    if (!email.trim()) {
      setError('Enter your email first, then request a reset.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setResetSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-7 max-w-md mx-auto">
      <p className="hub-eyebrow mb-3">Trip archive</p>
      <h1 className="hub-display text-5xl leading-none mb-4">Hub</h1>
      <p className="hub-muted text-sm leading-relaxed mb-8">
        Everywhere you've been, and what you did there.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="hub-input w-full px-3 py-2.5 text-base"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="hub-input w-full px-3 py-2.5 text-base"
          />
        </Field>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <button type="button" onClick={sendReset} className="hub-faint text-xs underline">
            Forgot password
          </button>
        </div>

        {error && (
          <p className="text-sm" style={{ color: '#a33' }}>
            {error}
          </p>
        )}
        {resetSent && (
          <p className="hub-muted text-sm">
            Reset link sent to {email}. Open it to set a new password.
          </p>
        )}
      </form>
    </div>
  );
}

/* ==========================================================================
   Item row
   ========================================================================== */

function ItemRow({ item, city, depth = 0, onToggleLink }) {
  // Explicit only: an item links to Maps when it's been marked as a place.
  // Nothing is guessed, so "walk round El Nido" stays plain unless you say so.
  const linked = item.mappable === true || !!item.maps_url;
  const url = linked ? mapsUrl(item, city) : null;
  // The icon always says what the item is; the button on the right says
  // whether it's linked. Conflating the two hid every food and drink icon.
  const icon = iconFor(item);

  return (
    <div
      style={depth > 0 ? { marginLeft: '18px', paddingLeft: '10px', borderLeft: '1px solid var(--navy-10)' } : undefined}
    >
      <div className="flex gap-2 py-1 text-sm items-start group">
        <span className="hub-muted" style={{ marginTop: '2px' }}>
          <Icon name={icon} />
        </span>

        <span className="flex-1 min-w-0">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
              {item.title}
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          {item.time_label && <span className="hub-faint text-xs ml-2 whitespace-nowrap">{item.time_label}</span>}
          {item.notes && <span className="block hub-muted text-xs leading-snug mt-0.5 italic">{item.notes}</span>}
        </span>

        <button
          onClick={() => onToggleLink(item, !linked)}
          title={linked ? 'Remove the map link' : 'Link this to Google Maps'}
          aria-label={linked ? `Unlink ${item.title}` : `Link ${item.title} to Google Maps`}
          className="shrink-0"
          style={{
            color: linked ? 'var(--navy)' : 'var(--navy-45)',
            opacity: linked ? 0.85 : 0.3,
            marginTop: '3px',
          }}
        >
          <Icon name="link" size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * A textarea that behaves like an outliner: starts on a bullet, Enter continues
 * the list at the same depth, Tab nests, Shift+Tab outdents, and the ⇤ ⇥ buttons
 * do the same where there's no Tab key. Shared by the day editor and the notes.
 */
function BulletEditor({ value, onChange, minRows = 6, placeholder, autoFocus, onReady }) {
  const ref = useRef(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta || !autoFocus) return;
    try {
      ta.focus({ preventScroll: true });
    } catch {
      ta.focus();
    }
    ta.setSelectionRange(ta.value.length, ta.value.length);
    if (onReady) onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next, caret) {
    onChange(next);
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (ta) ta.setSelectionRange(caret, caret);
    });
  }

  function shift(direction) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value: v } = ta;
    const from = v.lastIndexOf('\n', selectionStart - 1) + 1;
    const toRaw = v.indexOf('\n', selectionEnd);
    const to = toRaw === -1 ? v.length : toRaw;

    const block = v
      .slice(from, to)
      .split('\n')
      .map((line) => (direction > 0 ? `  ${line}` : line.replace(/^ {1,2}/, '')))
      .join('\n');

    apply(v.slice(0, from) + block + v.slice(to), Math.max(from, selectionStart + direction * 2));
  }

  function onKeyDown(e) {
    const { selectionStart, selectionEnd, value: v } = e.target;

    if (e.key === 'Tab') {
      e.preventDefault();
      shift(e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = v.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = v.slice(lineStart, selectionStart);
      const indent = currentLine.match(/^ */)[0];

      // Enter on an empty bullet outdents, then clears
      if (/^\s*-\s*$/.test(currentLine)) {
        if (indent.length > 0) {
          shift(-1);
          return;
        }
        apply(`${v.slice(0, lineStart)}\n${v.slice(selectionEnd)}`, lineStart + 1);
        return;
      }

      // A ** heading line isn't part of the list, so don't continue one
      const insert = /^\s*\*\*.*\*\*\s*$/.test(currentLine) ? '\n' : `\n${indent}- `;
      apply(v.slice(0, selectionStart) + insert + v.slice(selectionEnd), selectionStart + insert.length);
    }
  }

  return (
    <div>
      <div className="flex justify-end gap-1 mb-1.5">
        {/* preventDefault keeps focus in the textarea, so the keyboard stays up */}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => shift(-1)}
          className="px-2.5 py-1 text-xs hub-muted"
          style={{ border: '1px solid var(--navy-20)' }}
          title="Outdent (Shift+Tab)"
        >
          ⇤
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => shift(1)}
          className="px-2.5 py-1 text-xs hub-muted"
          style={{ border: '1px solid var(--navy-20)' }}
          title="Indent (Tab)"
        >
          ⇥
        </button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={Math.max(minRows, value.split('\n').length + 1)}
        spellCheck="false"
        placeholder={placeholder}
        className="hub-input w-full px-3 py-2 leading-relaxed"
        style={{
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          overflowX: 'hidden',
          fontSize: '16px',
        }}
      />
    </div>
  );
}

/* ==========================================================================
   Day editor
   ========================================================================== */

function DayEditor({ day, items, onSave, onCancel, knownCities, previousDay, isLastDay, laterDayCount = 0 }) {
  const [text, setText] = useState(() => itemsToText(items) || '- ');
  const [city, setCity] = useState(day.city || '');
  const [stay, setStay] = useState(day.stay || '');
  const [saving, setSaving] = useState(false);
  const [fillForward, setFillForward] = useState(false);
  const boxRef = useRef(null);

  const canFill = !isLastDay && stay.trim() && laterDayCount > 0;

  async function save() {
    setSaving(true);
    await onSave(
      parseBullets(text),
      { city: city.trim() || null, stay: isLastDay ? null : stay.trim() || null },
      canFill && fillForward
    );
    setSaving(false);
  }

  return (
    <div ref={boxRef} className="hub-card p-3 my-2" style={{ scrollMarginTop: '116px' }}>
      <span className="hub-eyebrow block mb-3">Editing {dayHeading(day.date) || day.label}</span>

      {previousDay && (previousDay.city || previousDay.stay) && (
        <button
          onClick={() => {
            if (previousDay.city) setCity(previousDay.city);
            if (previousDay.stay && !isLastDay) setStay(previousDay.stay);
          }}
          className="hub-faint text-xs underline mb-2"
        >
          ← same as {dayHeading(previousDay.date) || 'the day before'}
          {previousDay.city
            ? ` (${previousDay.city}${previousDay.stay && !isLastDay ? ', ' + previousDay.stay : ''})`
            : ''}
        </button>
      )}

      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr' }}>
        <Field label="Where">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            list="hub-cities"
            placeholder="San Sebastián"
            className="hub-input w-full px-2 py-1.5"
          />
        </Field>
        {/* The last day is the journey home, so there's nowhere to stay */}
        {!isLastDay && (
          <Field label="Staying at">
            <input
              value={stay}
              onChange={(e) => setStay(e.target.value)}
              placeholder="Hotel María Cristina"
              className="hub-input w-full px-2 py-1.5"
            />
            {canFill && (
              <button
                onClick={() => setFillForward((v) => !v)}
                className="flex items-start gap-2 mt-2 text-left"
                aria-pressed={fillForward}
              >
                <span
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    width: '15px',
                    height: '15px',
                    marginTop: '1px',
                    borderRadius: '2px',
                    border: `1px solid ${fillForward ? 'var(--navy)' : 'var(--navy-20)'}`,
                    backgroundColor: fillForward ? 'var(--navy)' : 'transparent',
                    color: 'var(--cream)',
                    fontSize: '10px',
                    lineHeight: 1,
                  }}
                  aria-hidden="true"
                >
                  {fillForward ? '✓' : ''}
                </span>
                <span className="text-xs hub-muted leading-snug">
                  Use for the next {laterDayCount} {laterDayCount === 1 ? 'day' : 'days'} too
                  <span className="hub-faint"> — accommodation only</span>
                </span>
              </button>
            )}
          </Field>
        )}
      </div>

      <BulletEditor
        value={text}
        onChange={setText}
        autoFocus
        onReady={() => {
          if (boxRef.current) boxRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <p className="hub-faint text-xs mt-2 leading-relaxed">
        Bullets are things you did — where you were and where you stayed go in the
        fields above. Enter starts the next bullet, Tab nests it. Time after a comma
        (<span className="italic">Dinner @ Kink, 8.30PM</span>), comment after a dash
        (<span className="italic">- great, cheap</span>).
      </p>

      <div className="flex gap-2 mt-3">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save day'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Trip detail
   ========================================================================== */

/** Pinned above the scroll area: back button and trip identity. */
function TripHeader({ trip, onBack }) {
  const nights = nightsBetween(trip.start_date, trip.end_date);
  return (
    <div
      className="px-5 pt-3 pb-2.5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backgroundColor: 'var(--cream)',
        borderBottom: '1px solid var(--navy-10)',
      }}
    >
      <button onClick={onBack} className="hub-muted text-sm mb-1.5">
        ← Back
      </button>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h1 className="hub-display text-2xl leading-tight">{trip.title}</h1>
        <Flags trip={trip} size={17} />
      </div>
      <p className="hub-faint text-xs mt-0.5">
        {dateRange(trip.start_date, trip.end_date)}
        {nights ? ` · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}
      </p>
      {trip.companions && (
        <p className="hub-faint text-xs mt-0.5 flex items-center gap-1.5">
          <Icon name="people" size={11} />
          {trip.companions}
        </p>
      )}
    </div>
  );
}

function TripDetail({ trip, onReload, userId, knownCities }) {
  const [editingDay, setEditingDay] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trip.title);
  const [editingDates, setEditingDates] = useState(false);
  const [dateDraft, setDateDraft] = useState({
    start: trip.start_date || '',
    end: trip.end_date || '',
    endTouched: !!trip.end_date,
  });
  const [notesDraft, setNotesDraft] = useState(trip.notes || '');
  // What the card shows today: either the manual list or the derived cities.
  // Editing writes it back explicitly, so removing a tag persists.
  const summaryTags = useMemo(() => tripPlaces(trip), [trip]);

  const days = useMemo(
    () => [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [trip]
  );

  const nights = nightsBetween(trip.start_date, trip.end_date);

  // The obvious next date: the day after the last one recorded
  const suggestedDate = useMemo(() => {
    const dated = days.filter((d) => d.date).map((d) => d.date).sort();
    const last = dated.length ? dated[dated.length - 1] : trip.end_date || trip.start_date;
    return nextDay(last) || trip.start_date;
  }, [days, trip.start_date, trip.end_date]);

  async function saveWho(next) {
    const { error } = await supabase
      .from('trips')
      .update({ companions: next.trim() || null })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save that: ${error.message}`);
      return;
    }
    await onReload();
  }

  async function saveSummary(next) {
    const { error } = await supabase
      .from('trips')
      .update({ summary: next.trim() || null })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save that: ${error.message}`);
      return;
    }
    await onReload();
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!next) return;
    const { error } = await supabase.from('trips').update({ title: next }).eq('id', trip.id);
    if (error) {
      alert(`Couldn't rename that: ${error.message}`);
      return;
    }
    setEditingName(false);
    await onReload();
  }

  /**
   * Some older itineraries only said "Day 1" or "Thursday", so the import could
   * only guess the month. Setting real dates here also dates the days, as long
   * as none of them has a date already.
   */
  async function saveDates() {
    const start = dateDraft.start;
    if (!start) return;
    const allUndated = days.length > 0 && days.every((d) => !d.date);

    // If no end date was given, infer it from the number of days
    const end =
      dateDraft.end ||
      (allUndated && days.length > 1 ? addDays(start, days.length - 1) : trip.end_date) ||
      null;

    const { error } = await supabase
      .from('trips')
      .update({ start_date: start, end_date: end })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save the dates: ${error.message}`);
      return;
    }

    if (allUndated) {
      const ordered = [...days].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
      for (let i = 0; i < ordered.length; i += 1) {
        const iso = addDays(start, i);
        // eslint-disable-next-line no-await-in-loop
        const { error: dayErr } = await supabase
          .from('days')
          .update({ date: iso })
          .eq('id', ordered[i].id);
        if (dayErr) {
          alert(`Dates saved, but day ${i + 1} failed: ${dayErr.message}`);
          break;
        }
      }
    }

    setEditingDates(false);
    await onReload();
  }

  async function saveNotes() {
    const { error } = await supabase
      .from('trips')
      .update({ notes: notesDraft.trim() || null })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save the notes: ${error.message}`);
      return;
    }
    setEditingNotes(false);
    await onReload();
  }

  /**
   * Copy this day's accommodation across every later day, skipping the last one
   * since that's the journey home. The map-link toggle comes along with it.
   */
  async function fillStayForward(day, stay) {
    const idx = days.findIndex((d) => d.id === day.id);
    if (idx === -1) return;
    const lastIdx = days.length - 1;
    const targets = days
      .slice(idx + 1)
      .filter((_, k) => idx + 1 + k !== lastIdx)
      .map((d) => d.id);
    if (!targets.length) return;

    // Left unlinked on purpose: linking is a deliberate act, and one tap on any
    // of them will link the whole run (see toggleStayLink).
    const { error } = await supabase
      .from('days')
      .update({ stay: stay || null, stay_mappable: stay ? false : null })
      .in('id', targets);
    if (error) alert(`Couldn't fill the rest of the trip: ${error.message}`);
  }

  async function saveDay(day, rows, dayFields, fillForward) {
    if (dayFields) {
      const { error } = await supabase.from('days').update(dayFields).eq('id', day.id);
      if (error) {
        alert(`Couldn't save the day details: ${error.message}`);
        return;
      }

      // A manual summary overrides the derived one, so a newly named location
      // would otherwise never reach the card. Append it — but only this one, so
      // tags you've deliberately removed stay removed.
      const city = (dayFields.city || '').trim();
      if (city && trip.summary) {
        const current = trip.summary
          .split(/\s*[;\u00b7]\s*|\s*,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!current.some((s) => s.toLowerCase() === city.toLowerCase())) {
          await supabase
            .from('trips')
            .update({ summary: [...current, city].join(', ') })
            .eq('id', trip.id);
        }
      }
    }
    await supabase.from('items').delete().eq('day_id', day.id);

    if (rows.length) {
      const ids = rows.map(() => crypto.randomUUID());
      const payload = rows.map((r, idx) => ({
        id: ids[idx],
        user_id: userId,
        day_id: day.id,
        parent_id: r.parentIndex == null ? null : ids[r.parentIndex],
        sort_order: idx,
        time_label: r.time_label,
        kind: r.kind,
        title: r.title,
        notes: r.notes,
        maps_url: r.maps_url,
      }));
      payload.sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
      const { error } = await supabase.from('items').insert(payload);
      if (error) {
        alert(`Couldn't save that day: ${error.message}`);
        return;
      }
    }
    if (fillForward && dayFields) {
      await fillStayForward(day, dayFields.stay);
    }
    setEditingDay(null);
    await onReload();
  }

  async function addDay() {
    const last = days[days.length - 1];
    const { error } = await supabase.from('days').insert({
      user_id: userId,
      trip_id: trip.id,
      date: newDayDate || suggestedDate,
      city: last ? last.city : trip.city,
      sort_order: days.length,
      // no stay: a day added at the end of a trip is usually the way home
    });
    if (error) {
      alert(`Couldn't add that day: ${error.message}`);
      return;
    }
    setAddingDay(false);
    await onReload();
  }

  async function deleteDay(day) {
    if (!confirm(`Delete ${dayHeading(day.date) || day.label} and everything on it?`)) return;
    await supabase.from('days').delete().eq('id', day.id);
    await onReload();
  }

  /**
   * Linking is per-accommodation rather than per-day: toggle one night at the
   * María Cristina and every night there follows, which is almost always what
   * you meant. Different hotels on the same trip are untouched.
   */
  async function toggleStayLink(day, next) {
    const name = (day.stay || '').trim().toLowerCase();
    const ids = name
      ? days.filter((d) => (d.stay || '').trim().toLowerCase() === name).map((d) => d.id)
      : [day.id];

    const { error } = await supabase.from('days').update({ stay_mappable: next }).in('id', ids);
    if (error) {
      alert(`Couldn't update that: ${error.message}`);
      return;
    }
    await onReload();
  }

  async function toggleLink(item, next) {
    const { error } = await supabase.from('items').update({ mappable: next }).eq('id', item.id);
    if (error) {
      alert(`Couldn't update that: ${error.message}`);
      return;
    }
    await onReload();
  }

  const cityFor = (day) => day.city || trip.city || trip.title;

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4">
        <div className="mb-3">
          <p className="hub-eyebrow mb-1.5">Trip name</p>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                autoFocus
                className="hub-input flex-1 px-2 py-1"
              />
              <Button onClick={saveName}>Save</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNameDraft(trip.title);
                  setEditingName(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="text-sm">
              {trip.title}
              <span className="hub-faint text-xs underline ml-2">edit</span>
            </button>
          )}
        </div>

        <div className="mb-3">
          <p className="hub-eyebrow mb-1.5">Dates</p>
          {editingDates ? (
            <div className="space-y-2">
              <DateField
                label="From"
                value={dateDraft.start}
                onChange={(v) =>
                  setDateDraft((d) => {
                    // With undated days, the end follows from how many there are
                    const span = days.length > 1 && days.every((x) => !x.date) ? days.length - 1 : 0;
                    const inferred = v ? addDays(v, span) : '';
                    return {
                      start: v,
                      end: !d.endTouched || !d.end || (v && d.end < v) ? inferred : d.end,
                      endTouched: d.endTouched,
                    };
                  })
                }
              />
              <DateField
                label="To"
                value={dateDraft.end}
                min={dateDraft.start || undefined}
                onChange={(v) => setDateDraft((d) => ({ ...d, end: v, endTouched: true }))}
              />
              {days.length > 0 && days.every((d) => !d.date) && (
                <p className="hub-faint text-xs leading-relaxed">
                  The {days.length} days here have no dates, so they'll be dated in order
                  from the start date.
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={saveDates} disabled={!dateDraft.start}>
                  Save dates
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDateDraft({
                      start: trip.start_date || '',
                      end: trip.end_date || '',
                      endTouched: !!trip.end_date,
                    });
                    setEditingDates(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingDates(true)} className="text-sm">
              {dateRange(trip.start_date, trip.end_date)}
              {!trip.end_date && <span className="hub-faint italic ml-1">(month only)</span>}
              <span className="hub-faint text-xs underline ml-2">edit</span>
            </button>
          )}
        </div>

        <div className="mb-3">
          <p className="hub-eyebrow mb-1.5">Who came</p>
          <Tags
            value={trip.companions}
            onSave={saveWho}
            placeholder="Name, then Enter"
            addLabel="+ add someone"
            sortAlpha
            quickAdds={['Solo', 'Big group']}
          />
        </div>

        <div>
          <p className="hub-eyebrow mb-1.5">Card summary</p>
          <Tags
            value={summaryTags.join(', ')}
            onSave={saveSummary}
            placeholder="City or area, then Enter"
            addLabel="+ add a place"
            reorder
          />
        </div>
      </div>

      <div className="hub-rule mx-5 my-4" />

      <div className="px-5 pb-8">
        {days.length === 0 && (
          <div className="hub-card p-4 mb-4">
            <p className="text-sm leading-relaxed mb-3">
              Nothing recorded yet. Add a day and start filling it in.
            </p>
            <Button onClick={() => {
                setNewDayDate(suggestedDate);
                setAddingDay(true);
              }}>Add a day</Button>
          </div>
        )}

        {days.map((day, dayIndex) => {
          const items = [...(day.items || [])].sort((a, b) => a.sort_order - b.sort_order);
          const roots = items.filter((i) => !i.parent_id);
          const childrenOf = (id) => items.filter((i) => i.parent_id === id);
          const isEditing = editingDay === day.id;
          // Heading always comes from the stored date, so a typo in the original
          // doc (wrong weekday, skipped day) can't survive into the app.
          const heading = dayHeading(day.date) || day.label || 'Untitled day';

          return (
            <div key={day.id} className="mb-6">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  {heading}
                  {day.city && <span className="hub-muted font-normal ml-2">{day.city}</span>}
                  {day.stay && (
                    <span className="hub-faint font-normal ml-2 inline-flex items-center gap-1">
                      <Icon name="stay" size={12} />
                      {day.stay_mappable ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            [day.stay, day.city || trip.city || trip.title].filter(Boolean).join(' ')
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-dotted underline-offset-2"
                        >
                          {day.stay}
                        </a>
                      ) : (
                        day.stay
                      )}
                      <button
                        onClick={() => toggleStayLink(day, !day.stay_mappable)}
                        title={
                          day.stay_mappable
                            ? 'Unlink — every night here is unlinked too'
                            : 'Link to Google Maps — every night here is linked too'
                        }
                        aria-label={
                          day.stay_mappable ? `Unlink ${day.stay}` : `Link ${day.stay} to Google Maps`
                        }
                        style={{
                          color: day.stay_mappable ? 'var(--navy)' : 'var(--navy-45)',
                          opacity: day.stay_mappable ? 0.85 : 0.3,
                        }}
                      >
                        <Icon name="link" size={11} />
                      </button>
                    </span>
                  )}
                </h2>
                <div className="flex gap-3 shrink-0">
                  {!isEditing && (
                    <button onClick={() => setEditingDay(day.id)} className="hub-faint text-xs">
                      Edit
                    </button>
                  )}
                  {dayIndex === days.length - 1 && (
                    <button onClick={() => deleteDay(day)} className="hub-faint text-xs">
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <DayEditor
                  day={day}
                  items={items}
                  knownCities={knownCities}
                  previousDay={dayIndex > 0 ? days[dayIndex - 1] : null}
                  isLastDay={dayIndex === days.length - 1 && days.length > 1}
                  onSave={(rows, fields, fill) => saveDay(day, rows, fields, fill)}
                  laterDayCount={Math.max(0, days.length - 2 - dayIndex)}
                  onCancel={() => setEditingDay(null)}
                />
              ) : items.length === 0 ? (
                <p className="hub-faint text-sm py-1 italic">Empty — tap Edit to fill it in.</p>
              ) : (
                <div>
                  {roots.map((item) => (
                    <React.Fragment key={item.id}>
                      <ItemRow item={item} city={cityFor(day)} onToggleLink={toggleLink} />
                      {childrenOf(item.id).map((child) => (
                        <ItemRow
                          key={child.id}
                          item={child}
                          city={cityFor(day)}
                          depth={1}
                          onToggleLink={toggleLink}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {addingDay ? (
            <div className="hub-card p-3 mb-4">
              <DateField label="Date" value={newDayDate || suggestedDate} onChange={setNewDayDate} />
              <div className="flex gap-2 mt-3">
                <Button onClick={addDay}>Add day</Button>
                <Button variant="ghost" onClick={() => setAddingDay(false)}>
                  Cancel
                </Button>
              </div>
            </div>
        ) : days.length > 0 ? (
          <button onClick={() => {
                setNewDayDate(suggestedDate);
                setAddingDay(true);
              }} className="hub-faint text-sm">
            + Add a day
          </button>
        ) : null}

        <div className="mt-10">
          <div className="hub-rule mb-4" />
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowNotes((v) => !v)} className="hub-eyebrow flex items-center gap-2">
              Miscellaneous notes
              <span aria-hidden="true">{showNotes ? '−' : '+'}</span>
            </button>
            {showNotes && !editingNotes && (
              <button
                onClick={() => {
                  if (!notesDraft.trim()) setNotesDraft('- ');
                  setEditingNotes(true);
                }}
                className="hub-faint text-xs underline"
              >
                {trip.notes ? 'Edit' : 'Add'}
              </button>
            )}
          </div>

          {showNotes && (
            editingNotes ? (
              <div>
                <BulletEditor
                  value={notesDraft}
                  onChange={setNotesDraft}
                  minRows={8}
                  placeholder={'- Anything worth keeping — links, places to try next time'}
                />
                <p className="hub-faint text-xs mt-2 leading-relaxed">
                  Same as the day editor: Enter starts the next bullet, Tab nests it. Wrap a
                  line in <span className="italic">**like this**</span> to make it a heading.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button onClick={saveNotes}>Save notes</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNotesDraft(trip.notes || '');
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : trip.notes ? (
              <div className="text-sm leading-relaxed hub-muted space-y-1">
                {trip.notes.split('\n').map((line, i) => {
                  const bold = line.match(/^\*\*(.+)\*\*$/);
                  if (bold) {
                    return (
                      <p key={i} className="hub-eyebrow mt-4 mb-1">
                        {bold[1]}
                      </p>
                    );
                  }
                  const url = line.match(/https?:\/\/\S+/);
                  if (url) {
                    const before = line.slice(0, url.index).replace(/[-\s]+$/, '');
                    let host = url[0];
                    try {
                      host = new URL(url[0]).hostname.replace(/^www\./, '');
                    } catch {
                      host = url[0];
                    }
                    return (
                      <p key={i} className="break-words">
                        {before && <span>{before} </span>}
                        <a href={url[0]} target="_blank" rel="noreferrer" className="underline">
                          {host}
                        </a>
                      </p>
                    );
                  }
                  const indent = line.match(/^ */)[0].length;
                  const body = line.replace(/^\s*/, '');
                  const bulleted = /^[-\u2022*]\s*/.test(body);
                  return (
                    <p key={i} style={{ paddingLeft: `${(indent >= 2 ? 1 : 0) * 14 + (bulleted ? 12 : 0)}px` }}>
                      {bulleted ? (
                        <>
                          <span className="hub-faint">· </span>
                          {body.replace(/^[-\u2022*]\s*/, '')}
                        </>
                      ) : (
                        body
                      )}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="hub-faint text-sm italic">Nothing yet.</p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Trip card
   ========================================================================== */

function TripCard({ trip, onOpen, showCountdown }) {
  const places = tripPlaces(trip);
  const nights = nightsBetween(trip.start_date, trip.end_date);
  const away = showCountdown ? daysUntil(trip.start_date) : null;

  return (
    <button onClick={() => onOpen(trip)} className="w-full text-left hub-card p-4 mb-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="hub-display text-2xl leading-tight">{trip.title}</span>
          <Flags trip={trip} size={17} />
        </span>
        {away != null && (
          <span className="text-right shrink-0 leading-none">
            <span className="hub-display text-3xl" style={{ color: 'var(--navy)' }}>
              {away === 0 ? 'Today' : away === 1 ? '1' : away}
            </span>
            {away > 1 && <span className="hub-eyebrow block mt-1">days to go</span>}
          </span>
        )}
      </div>

      {/* one line each, so the eye always finds them in the same place */}
      <div className="mt-1.5 hub-muted text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <Icon name="calendar" size={12} />
          <span>
            {dateRange(trip.start_date, trip.end_date)}
            {nights ? ` · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}
          </span>
        </div>
        {trip.companions && (
          <div className="flex items-center gap-1.5">
            <Icon name="people" size={12} />
            <span>{trip.companions}</span>
          </div>
        )}
      </div>

      {places.length > 0 && (
        <p className="text-xs mt-2.5 leading-relaxed hub-muted">{places.join(' · ')}</p>
      )}
    </button>
  );
}

/* ==========================================================================
   Archive
   ========================================================================== */

/** The search box and year pills live in the shell, above the scroll area, so
 *  they can't slide away. This renders the list only. */
function ArchiveHeader({ query, setQuery, years, onJump }) {
  return (
    <div
      className="px-5 pt-3 pb-2.5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backgroundColor: 'var(--cream)',
        borderBottom: '1px solid var(--navy-10)',
      }}
    >
      <h1 className="hub-display text-2xl mb-2">Been there</h1>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a place, restaurant, bar…"
        className="hub-input w-full px-3 py-2"
      />
      {!query.trim() && years.length > 1 && (
        <div
          className="flex gap-1.5 mt-2.5 -mx-5 px-5"
          style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}
        >
          {years.map((year) => (
            <button
              key={year}
              onClick={() => onJump(year)}
              className="shrink-0 px-2.5 py-1 rounded-full"
              style={{
                border: '1px solid var(--navy-20)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--navy)',
              }}
            >
              {year || '—'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Archive({ trips, onOpen, query, sectionRefs, onYears, userId, knownCities, cityCountries, onReload }) {
  const q = query.trim().toLowerCase();
  const [adding, setAdding] = useState(false);

  const matches = useMemo(() => {
    if (!q) return null;
    return trips.filter((trip) => {
      if (
        trip.title.toLowerCase().includes(q) ||
        (trip.country || '').toLowerCase().includes(q) ||
        (trip.city || '').toLowerCase().includes(q) ||
        (trip.companions || '').toLowerCase().includes(q)
      )
        return true;
      return (trip.days || []).some((d) =>
        (d.items || []).some((i) => i.title.toLowerCase().includes(q))
      );
    });
  }, [trips, q]);

  const byYear = useMemo(() => {
    const map = new Map();
    trips.forEach((t) => {
      const y = yearOf(t.start_date) ?? 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(t);
    });
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => [
        year,
        list.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || '')),
      ]);
  }, [trips]);

  useEffect(() => {
    onYears(byYear.map(([y]) => y));
  }, [byYear, onYears]);

  return (
    <div>
      <div className="px-5 pt-4 pb-8">
        {/* Retroactive entry: a trip you've already been on */}
        {!q &&
          (adding ? (
            <AddTripForm
              userId={userId}
              knownCities={knownCities}
              cityCountries={cityCountries}
              onCancel={() => setAdding(false)}
              onDone={async () => {
                setAdding(false);
                await onReload();
              }}
            />
          ) : (
            <div className="mb-6">
              <Button variant="ghost" onClick={() => setAdding(true)}>
                + Add a trip you've been on
              </Button>
            </div>
          ))}

        {matches ? (
          matches.length === 0 ? (
            <p className="hub-faint text-sm py-8">Nothing matching “{query}”.</p>
          ) : (
            <>
              <p className="hub-eyebrow mb-3">
                {matches.length} trip{matches.length === 1 ? '' : 's'}
              </p>
              {matches.map((t) => (
                <TripCard key={t.id} trip={t} onOpen={onOpen} />
              ))}
            </>
          )
        ) : (
          byYear.map(([year, list]) => (
            <section
              key={year}
              ref={(el) => {
                sectionRefs.current[year] = el;
              }}
              className="mb-7"
              style={{ scrollMarginTop: '120px' }}
            >
              <div className="flex items-center gap-3 mb-2.5">
                <h2 className="hub-display text-2xl leading-none">{year || '—'}</h2>
                <div className="hub-rule flex-1" />
                <span className="hub-faint text-xs">{list.length}</span>
              </div>
              {list.map((t) => (
                <TripCard key={t.id} trip={t} onOpen={onOpen} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Upcoming
   ========================================================================== */

const EMPTY_TRIP = { title: '', city: '', country: '', start_date: '', end_date: '', companions: '', countryTouched: false, endTouched: false };

/**
 * The add-trip form, shared by Upcoming and Archive so a trip can be added
 * before or after the fact from either place.
 */
function AddTripForm({ userId, knownCities, cityCountries, onDone, onCancel }) {
  const [form, setForm] = useState(EMPTY_TRIP);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim() || !form.start_date) return;
    setSaving(true);

    const tripId = crypto.randomUUID();
    const { error } = await supabase.from('trips').insert({
      id: tripId,
      user_id: userId,
      title: form.title.trim(),
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      companions: form.companions.trim() || null,
    });
    if (error) {
      setSaving(false);
      alert(`Couldn't add that trip: ${error.message}`);
      return;
    }

    // One empty day per date, so the trip is ready to fill in
    const dates = datesBetween(form.start_date, form.end_date);
    if (dates.length) {
      const { error: dayError } = await supabase.from('days').insert(
        dates.map((date, idx) => ({
          user_id: userId,
          trip_id: tripId,
          date,
          city: form.city.trim() || null,
          sort_order: idx,
        }))
      );
      if (dayError) {
        setSaving(false);
        alert(`Trip added, but the days failed: ${dayError.message}`);
        return;
      }
    }
    setSaving(false);
    setForm(EMPTY_TRIP);
    await onDone();
  }

  return (
    <div className="hub-card p-4 mt-3 space-y-3">
      <Field label="Trip name">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Tomorrowland, Copenhagen, the lads' golf trip…"
          className="hub-input w-full px-3 py-2"
        />
      </Field>

      <Field label="Destination">
        <input
          value={form.city}
          onChange={(e) => {
            const city = e.target.value;
            // Fill the country in from somewhere you've already been, unless
            // you've typed one yourself
            const guess = (cityCountries || {})[city.trim().toLowerCase()];
            setForm((f) => ({
              ...f,
              city,
              country: guess && !f.countryTouched ? guess : f.country,
            }));
          }}
          list="hub-cities"
          placeholder="Boom, or Copenhagen"
          className="hub-input w-full px-3 py-2"
        />
        <datalist id="hub-cities">
          {knownCities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field label={form.country && !form.countryTouched ? 'Country (filled in for you)' : 'Country'}>
        <input
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value, countryTouched: true })}
          list="hub-countries"
          placeholder="Pick one, or separate several with ;"
          className="hub-input w-full px-3 py-2"
        />
        <datalist id="hub-countries">
          {COUNTRY_NAMES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <DateField
        label="From"
        value={form.start_date}
        onChange={(v) =>
          setForm((f) => ({
            ...f,
            start_date: v,
            // Seed the end date so its picker opens on the trip's month rather
            // than today, and so an end before the start isn't possible.
            end_date: !f.endTouched || !f.end_date || (v && f.end_date < v) ? v : f.end_date,
          }))
        }
      />
      <DateField
        label="To"
        value={form.end_date}
        min={form.start_date || undefined}
        onChange={(v) => setForm({ ...form, end_date: v, endTouched: true })}
      />

      <div>
        <span className="hub-eyebrow block mb-1.5">Who's coming</span>
        <Tags
          value={form.companions}
          onSave={(v) => setForm({ ...form, companions: v })}
          placeholder="Name, then Enter"
          addLabel="+ add someone"
          sortAlpha
          quickAdds={['Solo', 'Big group']}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !form.title.trim() || !form.start_date}>
          {saving ? 'Adding…' : 'Add trip'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setForm(EMPTY_TRIP);
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Upcoming({ trips, onOpen, onReload, userId, knownCities, cityCountries }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="px-5 pt-4 pb-8">
      <h1 className="hub-display text-3xl mb-4">Coming up</h1>

      {trips.length === 0 && !adding && (
        <p className="hub-muted text-sm leading-relaxed mb-5">
          Nothing booked. Add a destination and dates — the days can come later.
        </p>
      )}

      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onOpen={onOpen} showCountdown />
      ))}

      {adding ? (
        <AddTripForm
          userId={userId}
          knownCities={knownCities}
          cityCountries={cityCountries}
          onCancel={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await onReload();
          }}
        />
      ) : (
        <div className="mt-4">
          <Button variant="ghost" onClick={() => setAdding(true)}>
            + Add a trip
          </Button>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   World map — precomputed country outlines, no mapping library needed
   ========================================================================== */

function WorldMap({ trips, onOpen }) {
  const [picked, setPicked] = useState(null);

  // country code -> the trips that went there
  const byCode = useMemo(() => {
    const m = new Map();
    trips.forEach((t) => {
      countriesOf(t).forEach((name) => {
        const raw = countryCode(name);
        if (!raw) return;
        const code = raw.includes('-') ? raw.split('-')[0].toUpperCase() : raw;
        if (!m.has(code)) m.set(code, { names: new Set(), trips: [] });
        m.get(code).names.add(name);
        m.get(code).trips.push(t);
      });
    });
    return m;
  }, [trips]);

  const hit = picked ? byCode.get(picked) : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`World map, ${byCode.size} countries visited`}
        style={{ display: 'block' }}
      >
        {Object.entries(COUNTRY_PATHS).map(([code, d]) => {
          const visited = byCode.has(code);
          const active = picked === code;
          return (
            <path
              key={code}
              d={d}
              fill={active ? 'var(--amber)' : visited ? 'var(--navy)' : 'var(--navy-10)'}
              stroke="var(--cream)"
              strokeWidth="0.4"
              onClick={visited ? () => setPicked(active ? null : code) : undefined}
              style={{ cursor: visited ? 'pointer' : 'default' }}
            >
              {visited && <title>{[...byCode.get(code).names].join(', ')}</title>}
            </path>
          );
        })}
      </svg>

      {hit ? (
        <div className="hub-card p-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2">
              <Flag country={[...hit.names][0]} size={20} />
              <span className="text-sm font-medium">{[...hit.names].join(', ')}</span>
            </span>
            <button onClick={() => setPicked(null)} className="hub-faint text-xs" aria-label="Close">
              ×
            </button>
          </div>
          {[...new Set(hit.trips)]
            .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
            .map((t) => (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className="w-full text-left py-1.5 flex items-baseline justify-between gap-3 border-b hub-border"
              >
                <span className="text-sm">{t.title}</span>
                <span className="hub-faint text-xs shrink-0">
                  {dateRange(t.start_date, t.end_date)}
                </span>
              </button>
            ))}
        </div>
      ) : (
        <p className="hub-faint text-xs mt-2">
          {byCode.size} countries — tap one to see the trips.
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
   Year calendar — every day away, shaded
   ========================================================================== */

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function YearCalendar({ year, trips }) {
  const away = useMemo(() => {
    const set = new Map();
    trips.forEach((t) => {
      const s = parseISO(t.start_date);
      const e = parseISO(t.end_date) || s;
      if (!s) return;
      for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() !== year) continue;
        set.set(`${d.getMonth()}-${d.getDate()}`, t.title);
      }
    });
    return set;
  }, [trips, year]);

  return (
    <div
      className="grid gap-4 mt-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(94px, 1fr))' }}
    >
      {MONTH_NAMES.map((name, m) => {
        const first = new Date(year, m, 1);
        const lead = (first.getDay() + 6) % 7; // weeks start Monday
        const total = new Date(year, m + 1, 0).getDate();
        const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
        return (
          <div key={name}>
            <p className="hub-eyebrow mb-1">{name}</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {cells.map((day, idx) => {
                const trip = day ? away.get(`${m}-${day}`) : null;
                return (
                  <span
                    key={idx}
                    title={trip || undefined}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '1px',
                      backgroundColor: !day
                        ? 'transparent'
                        : trip
                        ? 'var(--navy)'
                        : 'var(--navy-10)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Stats
   ========================================================================== */

// How many travel companions to list before the "show all" link
const PEOPLE_SHOWN = 8;

function Stats({ trips, onOpen }) {
  const past = useMemo(() => trips.filter((t) => t.start_date <= todayISO()), [trips]);
  const [openYear, setOpenYear] = useState(null);
  const [openPerson, setOpenPerson] = useState(null);
  const [allPeople, setAllPeople] = useState(false);

  const stats = useMemo(() => {
    const perYear = new Map();
    const countries = new Map();
    const people = new Map();
    let nights = 0;

    past.forEach((t) => {
      const y = yearOf(t.start_date);
      if (y) {
        if (!perYear.has(y)) perYear.set(y, { trips: 0, nights: 0 });
        perYear.get(y).trips += 1;
        perYear.get(y).nights += nightsBetween(t.start_date, t.end_date) || 0;
      }
      countriesOf(t).forEach((c) => countries.set(c, (countries.get(c) || 0) + 1));
      nights += nightsBetween(t.start_date, t.end_date) || 0;

      (t.companions || '')
        .split(/\s*[;\u00b7]\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((name) => {
          if (!people.has(name)) people.set(name, []);
          people.get(name).push(t);
        });
    });

    return {
      perYear: [...perYear.entries()].sort((a, b) => b[0] - a[0]),
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      people: [...people.entries()].sort(
        (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
      ),
      nights,
    };
  }, [past]);

  const maxTrips = Math.max(1, ...stats.perYear.map(([, v]) => v.trips));
  const maxPerson = Math.max(1, ...stats.people.map(([, l]) => l.length));

  return (
    <div className="px-5 pt-4 pb-8">
      <h1 className="hub-display text-3xl mb-6">The tally</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          [past.length, 'trips'],
          [stats.countries.length, 'countries'],
          [stats.nights, 'nights away'],
        ].map(([n, label]) => (
          <div key={label}>
            <p className="hub-display text-4xl leading-none">{n}</p>
            <p className="hub-eyebrow mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="hub-rule mb-4" />
      <p className="hub-eyebrow mb-3">Where you've been</p>
      <div className="mb-8">
        <WorldMap trips={past} onOpen={onOpen} />
      </div>

      <div className="hub-rule mb-4" />
      <p className="hub-eyebrow mb-2">Trips per year</p>
      <p className="hub-faint text-xs mb-2">Tap a year to see the days away.</p>
      <div className="mb-8">
        {stats.perYear.map(([year, v]) => (
          <div key={year}>
            <button
              onClick={() => setOpenYear(openYear === year ? null : year)}
              className="w-full text-left py-1.5"
              aria-expanded={openYear === year}
            >
              {/* counts on their own line, spelled out, rather than squeezed
                  into a narrow column beside the bar */}
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm font-medium tabular-nums">{year}</span>
                <span className="hub-muted text-xs">
                  {v.trips} {v.trips === 1 ? 'trip' : 'trips'} · {v.nights}{' '}
                  {v.nights === 1 ? 'night' : 'nights'}
                </span>
              </div>
              <span className="block h-2.5" style={{ backgroundColor: 'var(--navy-10)' }}>
                <span
                  className="block h-2.5"
                  style={{
                    width: `${Math.round((v.trips / maxTrips) * 100)}%`,
                    backgroundColor: 'var(--navy)',
                  }}
                />
              </span>
            </button>
            {openYear === year && (
              <YearCalendar year={year} trips={past.filter((t) => yearOf(t.start_date) === year || yearOf(t.end_date) === year)} />
            )}
          </div>
        ))}
      </div>

      {stats.people.length > 0 && (
        <>
          <div className="hub-rule mb-4" />
          <p className="hub-eyebrow mb-2">Who you travel with</p>
          <p className="hub-faint text-xs mb-2">Tap a name to see the trips.</p>
          <div className="mb-8">
            {(allPeople ? stats.people : stats.people.slice(0, PEOPLE_SHOWN)).map(([name, list]) => {
              const open = openPerson === name;
              const pct = Math.round((list.length / maxPerson) * 100);
              return (
                <div key={name}>
                  <button
                    onClick={() => setOpenPerson(open ? null : name)}
                    className="w-full text-left flex items-center gap-3 py-1"
                    aria-expanded={open}
                  >
                    <span className="text-xs w-24 shrink-0 truncate" style={{ color: 'var(--navy)' }}>
                      {name}
                    </span>
                    <span className="flex-1 h-3" style={{ backgroundColor: 'var(--navy-10)' }}>
                      <span
                        className="block h-3"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--navy)' }}
                      />
                    </span>
                    <span className="hub-faint text-xs w-12 shrink-0 text-right">
                      {list.length}
                    </span>
                  </button>
                  {open && (
                    <div className="pl-24 pb-2">
                      {[...list]
                        .sort((x, y) => (y.start_date || '').localeCompare(x.start_date || ''))
                        .map((t) => (
                          <button
                            key={t.id}
                            onClick={() => onOpen(t)}
                            className="w-full text-left flex items-baseline justify-between gap-3 py-1 border-b hub-border"
                          >
                            <span className="text-sm">{t.title}</span>
                            <span className="hub-faint text-xs shrink-0">
                              {yearOf(t.start_date)}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}

            {stats.people.length > PEOPLE_SHOWN && (
              <button
                onClick={() => {
                  setAllPeople((v) => !v);
                  setOpenPerson(null);
                }}
                className="hub-faint text-xs underline mt-2"
              >
                {allPeople
                  ? 'Show fewer'
                  : `Show all ${stats.people.length}`}
              </button>
            )}
          </div>
        </>
      )}

      <div className="hub-rule mb-4" />
      <p className="hub-eyebrow mb-2">Countries</p>
      <div className="text-sm leading-relaxed">
        {stats.countries.map(([c, n], i) => (
          <div
            key={c}
            className="flex items-center justify-between py-1"
            // rule between rows only, so the list doesn't end on a stray line
            style={i > 0 ? { borderTop: '1px solid var(--navy-10)' } : undefined}
          >
            <span className="flex items-center gap-2">
              <Flag country={c} size={20} />
              {c}
            </span>
            {n > 1 && <span className="hub-faint text-xs">×{n}</span>}
          </div>
        ))}
      </div>

      <div className="hub-rule mt-10 mb-4" />
      <button onClick={() => supabase.auth.signOut()} className="hub-faint text-xs underline">
        Sign out
      </button>
    </div>
  );
}

/* ==========================================================================
   Shell
   ========================================================================== */

const TABS = [
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
];

function AppInner() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [trips, setTrips] = useState(null);
  const [tab, setTab] = useState('archive');
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [years, setYears] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);
  const prevOpen = useRef(null);
  const prevTab = useRef('archive');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('*, days(*, items(*))')
      .order('start_date', { ascending: false });
    if (error) {
      console.error('Loading trips failed:', error);
      setLoadError(error.message || String(error));
      setTrips([]);
      return;
    }
    setLoadError(null);
    setTrips(data || []);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  /**
   * One scroll container serves every view, so its position is managed by hand.
   *
   * The position is recorded as you scroll rather than read when you navigate:
   * by the time a layout effect runs, React has already swapped in the shorter
   * trip view and the browser has clamped scrollTop down, so reading it there
   * returns a smaller number and Back lands you above where you were.
   */
  const listScroll = useRef({});      // last known position per tab
  const suspendSave = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (suspendSave.current || openId) return;
      listScroll.current[tab] = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [openId, tab]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const openedTrip = openId && !prevOpen.current;
    const closedTrip = !openId && prevOpen.current;
    const switchedTrip = openId && prevOpen.current && openId !== prevOpen.current;
    const switchedTab = tab !== prevTab.current;

    let raf;
    if (openedTrip || switchedTrip) {
      suspendSave.current = true;       // ignore the clamp the swap will trigger
      el.scrollTop = 0;
    } else if (closedTrip || switchedTab) {
      const target = listScroll.current[tab] || 0;
      suspendSave.current = true;
      el.scrollTop = target;

      // Flags are images and cards render in stages, so the container may not
      // be tall enough yet. Keep reasserting for a few frames, then release.
      let tries = 0;
      const settle = () => {
        if (!scrollRef.current) return;
        if (Math.abs(scrollRef.current.scrollTop - target) > 1 && tries < 12) {
          scrollRef.current.scrollTop = target;
          tries += 1;
          raf = requestAnimationFrame(settle);
        } else {
          suspendSave.current = false;
        }
      };
      raf = requestAnimationFrame(settle);
    }

    prevOpen.current = openId;
    prevTab.current = tab;

    const release = setTimeout(() => {
      suspendSave.current = false;
    }, 400);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(release);
    };
  }, [openId, tab]);

  const { past, upcoming } = useMemo(() => {
    const t = todayISO();
    const all = trips || [];
    return {
      past: all.filter((x) => x.start_date <= t),
      upcoming: all.filter((x) => x.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    };
  }, [trips]);

  const knownCities = useMemo(() => {
    const s = new Set();
    (trips || []).forEach((t) => {
      if (t.city) s.add(t.city);
      (t.days || []).forEach((d) => d.city && s.add(d.city));
    });
    return [...s].sort();
  }, [trips]);

  /**
   * city -> country, learned from your own archive. Only trips naming a single
   * country contribute, since a city on a "Peru; Bolivia" trip could be either.
   */
  const cityCountries = useMemo(() => {
    const map = {};
    (trips || []).forEach((t) => {
      const list = countriesOf(t);
      if (list.length !== 1) return;
      const country = list[0];
      const add = (c) => {
        if (c && c.trim()) map[c.trim().toLowerCase()] = country;
      };
      add(t.city);
      (t.days || []).forEach((d) => add(d.city));
    });
    return map;
  }, [trips]);

  const open = useMemo(() => (trips || []).find((t) => t.id === openId) || null, [trips, openId]);

  if (checking) return <Spinner label="Checking your session" />;
  if (!session) return <SignIn />;
  if (loadError) {
    return (
      <div className="min-h-screen px-6 pt-16">
        <p className="hub-eyebrow mb-3">Couldn't load your trips</p>
        <p className="text-sm mb-4" style={{ color: '#a33' }}>{loadError}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  }
  if (!trips) return <Spinner label="Loading your trips" />;

  return (
    <div
      className="flex flex-col"
      style={{
        // 100vh on iOS includes the strip behind the home indicator, which
        // pushed the tab bar off screen. dvh tracks the usable viewport.
        height: '100dvh',
        maxHeight: '100dvh',
        backgroundColor: 'var(--cream)',
      }}
    >
      <main ref={scrollRef} className="flex-1 hub-scroll" style={{ minHeight: 0 }}>
        {/* scrolls away; the header below it stays put */}
        <BrandBar />

        {open ? (
          <TripHeader trip={open} onBack={() => setOpenId(null)} />
        ) : tab === 'archive' ? (
          <ArchiveHeader
            query={query}
            setQuery={setQuery}
            years={years}
            onJump={(year) => {
              const el = sectionRefs.current[year];
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        ) : null}

        {open ? (
          <TripDetail
            trip={open}
            userId={session.user.id}
            knownCities={knownCities}
            onReload={load}
          />
        ) : tab === 'archive' ? (
          <Archive
            trips={past}
            query={query}
            sectionRefs={sectionRefs}
            onYears={setYears}
            userId={session.user.id}
            knownCities={knownCities}
            cityCountries={cityCountries}
            onReload={load}
            onOpen={(t) => setOpenId(t.id)}
          />
        ) : tab === 'upcoming' ? (
          <Upcoming
            trips={upcoming}
            userId={session.user.id}
            knownCities={knownCities}
            cityCountries={cityCountries}
            onOpen={(t) => setOpenId(t.id)}
            onReload={load}
          />
        ) : (
          <Stats trips={trips} onOpen={(t) => setOpenId(t.id)} />
        )}
      </main>

      {!open && (
        <nav
          className="border-t hub-border shrink-0"
          style={{
            backgroundColor: 'rgba(244, 241, 223, 0.97)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex flex-col items-center gap-1 pt-2.5 pb-2"
                  style={{
                    color: active ? 'var(--navy)' : 'var(--navy-45)',
                    borderTop: active ? '2px solid var(--navy)' : '2px solid transparent',
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={t.icon} size={19} />
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 600,
                      letterSpacing: '0.11em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
