import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  tripPlaces,
  yearOf,
} from './helpers';

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

/** Icon for a line. Flights get a plane, other travel a route arrow. */
function iconFor(item) {
  const t = (item.title || '').toLowerCase();
  if (/\b(fly|flight|plane|airport)\b/.test(t)) return 'plane';
  if (item.kind === 'travel') return 'route';
  if (item.kind === 'food') return 'food';
  if (item.kind === 'drink') return 'drink';
  if (item.kind === 'stay') return 'stay';
  return 'dot';
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

/** Companions are stored as one comma-separated string, edited as chips. */
function People({ value, onSave }) {
  const list = (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  function commit(next) {
    onSave(next.join(', '));
  }

  function add() {
    const name = draft.trim().replace(/,$/, '');
    if (!name) return;
    if (list.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setDraft('');
      return;
    }
    commit([...list, name]);
    setDraft('');
  }

  if (!open && list.length === 0) {
    return (
      <button onClick={() => setOpen(true)} className="hub-faint text-xs underline">
        + Add who you went with
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hub-eyebrow mr-1">With</span>
        {list.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-sm"
            style={{ backgroundColor: 'var(--navy-10)' }}
          >
            {p}
            <button
              onClick={() => commit(list.filter((x) => x !== p))}
              aria-label={`Remove ${p}`}
              className="hub-faint"
              style={{ lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
        {!open && (
          <button onClick={() => setOpen(true)} className="hub-faint text-xs underline ml-1">
            + add
          </button>
        )}
      </div>

      {open && (
        <div className="flex items-center gap-2 mt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Name, then Enter"
            autoFocus
            className="hub-input flex-1 px-2 py-1 text-sm"
          />
          <Button onClick={add}>Add</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
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
  const icon = linked ? 'pin' : iconFor(item);

  return (
    <div
      style={depth > 0 ? { marginLeft: '18px', paddingLeft: '10px', borderLeft: '1px solid var(--navy-10)' } : undefined}
    >
      <div className="flex gap-2 py-1 text-sm items-start group">
        <span className={linked ? '' : 'hub-faint'} style={{ marginTop: '2px' }}>
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
          className="shrink-0 opacity-40 hover:opacity-100 focus:opacity-100"
          style={{ color: linked ? 'var(--navy)' : 'var(--navy-45)', marginTop: '2px' }}
        >
          <Icon name="pin" size={12} />
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   Day editor
   ========================================================================== */

function DayEditor({ day, items, onSave, onCancel, knownCities }) {
  const [text, setText] = useState(() => itemsToText(items) || '- ');
  const [city, setCity] = useState(day.city || '');
  const [stay, setStay] = useState(day.stay || '');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  function apply(next, caret) {
    setText(next);
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (ta) ta.setSelectionRange(caret, caret);
    });
  }

  function shift(direction) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value } = ta;
    const from = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const toRaw = value.indexOf('\n', selectionEnd);
    const to = toRaw === -1 ? value.length : toRaw;

    const block = value
      .slice(from, to)
      .split('\n')
      .map((line) => (direction > 0 ? `  ${line}` : line.replace(/^ {1,2}/, '')))
      .join('\n');

    apply(value.slice(0, from) + block + value.slice(to), Math.max(from, selectionStart + direction * 2));
  }

  function onKeyDown(e) {
    const { selectionStart, selectionEnd, value } = e.target;

    if (e.key === 'Tab') {
      e.preventDefault();
      shift(e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const indent = currentLine.match(/^ */)[0];

      if (/^\s*-\s*$/.test(currentLine)) {
        if (indent.length > 0) {
          shift(-1);
          return;
        }
        apply(`${value.slice(0, lineStart)}\n${value.slice(selectionEnd)}`, lineStart + 1);
        return;
      }

      const insert = `\n${indent}- `;
      apply(value.slice(0, selectionStart) + insert + value.slice(selectionEnd), selectionStart + insert.length);
    }
  }

  async function save() {
    setSaving(true);
    await onSave(parseBullets(text), { city: city.trim() || null, stay: stay.trim() || null });
    setSaving(false);
  }

  return (
    <div className="hub-card p-3 my-2">
      <div className="flex items-center justify-between mb-3">
        <span className="hub-eyebrow">Editing {dayHeading(day.date) || day.label}</span>
        <div className="flex gap-1">
          <button
            onClick={() => shift(-1)}
            className="px-2 py-1 text-xs hub-muted"
            style={{ border: '1px solid var(--navy-20)' }}
            title="Outdent (Shift+Tab)"
          >
            ⇤
          </button>
          <button
            onClick={() => shift(1)}
            className="px-2 py-1 text-xs hub-muted"
            style={{ border: '1px solid var(--navy-20)' }}
            title="Indent (Tab)"
          >
            ⇥
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Where">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            list="hub-cities"
            placeholder="San Sebastián"
            className="hub-input w-full px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Staying at">
          <input
            value={stay}
            onChange={(e) => setStay(e.target.value)}
            placeholder="Hotel María Cristina"
            className="hub-input w-full px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={Math.max(6, text.split('\n').length + 1)}
        spellCheck="false"
        className="hub-input w-full px-3 py-2 text-sm leading-relaxed"
        style={{ whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
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

function TripDetail({ trip, onBack, onReload, userId, knownCities }) {
  const [editingDay, setEditingDay] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState(trip.end_date || trip.start_date);
  const [showNotes, setShowNotes] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summary, setSummary] = useState(trip.summary || '');

  const days = useMemo(
    () => [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [trip]
  );

  const nights = nightsBetween(trip.start_date, trip.end_date);

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

  async function saveSummary() {
    const { error } = await supabase
      .from('trips')
      .update({ summary: summary.trim() || null })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save that: ${error.message}`);
      return;
    }
    setEditingSummary(false);
    await onReload();
  }

  async function saveDay(day, rows, dayFields) {
    if (dayFields) {
      const { error } = await supabase.from('days').update(dayFields).eq('id', day.id);
      if (error) {
        alert(`Couldn't save the day details: ${error.message}`);
        return;
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
    setEditingDay(null);
    await onReload();
  }

  async function addDay() {
    const { error } = await supabase.from('days').insert({
      user_id: userId,
      trip_id: trip.id,
      date: newDayDate || null,
      sort_order: days.length,
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
      <div className="px-5 pt-4 pb-2">
        <button onClick={onBack} className="hub-muted text-sm mb-5">
          ← Back
        </button>

        <p className="hub-eyebrow mb-2">{dateRange(trip.start_date, trip.end_date)}</p>
        <h1 className="hub-display text-4xl leading-tight mb-2 flex items-baseline gap-2.5 flex-wrap">
          {trip.title}
          <Flags trip={trip} size={22} />
        </h1>
        <p className="hub-muted text-xs">
          {countriesOf(trip).join(' · ') || '—'}
          {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
        </p>

        <div className="mt-3">
          <People value={trip.companions} onSave={saveWho} />
        </div>

        <div className="mt-2">
          {editingSummary ? (
            <div className="flex items-center gap-2">
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveSummary()}
                placeholder="St Tropez · Ramatuelle · Monaco"
                autoFocus
                className="hub-input flex-1 px-2 py-1 text-sm"
              />
              <Button onClick={saveSummary}>Save</Button>
            </div>
          ) : (
            <button onClick={() => setEditingSummary(true)} className="hub-faint text-xs underline">
              {trip.summary ? 'Edit card summary' : 'Set card summary'}
            </button>
          )}
        </div>
      </div>

      <div className="hub-rule mx-5 my-4" />

      <div className="px-5 pb-8">
        {days.length === 0 && (
          <div className="hub-card p-4 mb-4">
            <p className="text-sm leading-relaxed mb-3">
              Nothing recorded yet. Add a day and start filling it in.
            </p>
            <Button onClick={() => setAddingDay(true)}>Add a day</Button>
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
                      {day.stay}
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
                  onSave={(rows, fields) => saveDay(day, rows, fields)}
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

        {days.length > 0 &&
          (addingDay ? (
            <div className="hub-card p-3 mb-4">
              <Field label="Date">
                <input
                  type="date"
                  value={newDayDate || ''}
                  onChange={(e) => setNewDayDate(e.target.value)}
                  className="hub-input px-3 py-2 text-sm"
                />
              </Field>
              <div className="flex gap-2 mt-3">
                <Button onClick={addDay}>Add day</Button>
                <Button variant="ghost" onClick={() => setAddingDay(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingDay(true)} className="hub-faint text-sm">
              + Add a day
            </button>
          ))}

        {trip.notes && (
          <div className="mt-10">
            <div className="hub-rule mb-4" />
            <button onClick={() => setShowNotes((v) => !v)} className="hub-eyebrow flex items-center gap-2">
              Notes &amp; recommendations
              <span aria-hidden="true">{showNotes ? '−' : '+'}</span>
            </button>
            {showNotes && (
              <div className="mt-3 text-sm leading-relaxed hub-muted space-y-1">
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
                  return <p key={i}>{line.replace(/^-\s*/, '· ')}</p>;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Trip card
   ========================================================================== */

function TripCard({ trip, onOpen, showCountdown }) {
  const places = tripPlaces(trip, 5);
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

      <p className="hub-muted text-xs mt-1">
        {dateRange(trip.start_date, trip.end_date)}
        {nights ? ` · ${nights}n` : ''}
        {trip.companions ? ` · ${trip.companions}` : ''}
      </p>

      {places.length > 0 ? (
        <p className="text-xs mt-2.5 leading-relaxed hub-muted">{places.join(' · ')}</p>
      ) : (
        <p className="hub-faint text-xs mt-2.5 italic">Not filled in yet</p>
      )}
    </button>
  );
}

/* ==========================================================================
   Archive
   ========================================================================== */

function Archive({ trips, onOpen }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

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

  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <h1 className="hub-display text-3xl mb-3">Been there</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, restaurant, bar…"
          className="hub-input w-full px-3 py-2 text-sm"
        />
      </div>

      <div className="px-5 pb-8">
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
            <section key={year} className="mb-7">
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

function Upcoming({ trips, onOpen, onReload, userId, knownCities }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', country: '', start_date: '', end_date: '', companions: '' });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim() || !form.start_date) return;
    setSaving(true);
    const { error } = await supabase.from('trips').insert({
      user_id: userId,
      title: form.title.trim(),
      city: form.title.includes('/') ? null : form.title.trim(),
      country: form.country.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      companions: form.companions.trim() || null,
    });
    setSaving(false);
    if (error) {
      alert(`Couldn't add that trip: ${error.message}`);
      return;
    }
    setForm({ title: '', country: '', start_date: '', end_date: '', companions: '' });
    setAdding(false);
    await onReload();
  }

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
        <div className="hub-card p-4 mt-3 space-y-3">
          <Field label="Destination">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              list="hub-cities"
              placeholder="Copenhagen, or South of France"
              className="hub-input w-full px-3 py-2 text-base"
            />
            <datalist id="hub-cities">
              {knownCities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Country">
            <input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              list="hub-countries"
              placeholder="Pick one, or separate several with ;"
              className="hub-input w-full px-3 py-2 text-base"
            />
            <datalist id="hub-countries">
              {COUNTRY_NAMES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="hub-input w-full px-3 py-2 text-sm"
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="hub-input w-full px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="With">
            <input
              value={form.companions}
              onChange={(e) => setForm({ ...form, companions: e.target.value })}
              placeholder="Optional"
              className="hub-input w-full px-3 py-2 text-base"
            />
          </Field>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.start_date}>
              {saving ? 'Adding…' : 'Add trip'}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
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

function Bar({ label, value, max, note }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="hub-muted text-xs w-9 shrink-0 tabular-nums">{label}</span>
      <span className="flex-1 h-3" style={{ backgroundColor: 'var(--navy-10)' }}>
        <span className="block h-3" style={{ width: `${pct}%`, backgroundColor: 'var(--navy)' }} />
      </span>
      <span className="hub-faint text-xs w-16 shrink-0 text-right">{note ?? value}</span>
    </div>
  );
}

function Stats({ trips, onOpen }) {
  const past = useMemo(() => trips.filter((t) => t.start_date <= todayISO()), [trips]);
  const [openYear, setOpenYear] = useState(null);

  const stats = useMemo(() => {
    const perYear = new Map();
    const countries = new Map();
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
    });

    return {
      perYear: [...perYear.entries()].sort((a, b) => b[0] - a[0]),
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      nights,
    };
  }, [past]);

  const maxTrips = Math.max(1, ...stats.perYear.map(([, v]) => v.trips));

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
              className="w-full text-left"
              aria-expanded={openYear === year}
            >
              <Bar
                label={String(year).slice(2)}
                value={v.trips}
                max={maxTrips}
                note={`${v.trips} · ${v.nights}n`}
              />
            </button>
            {openYear === year && (
              <YearCalendar year={year} trips={past.filter((t) => yearOf(t.start_date) === year || yearOf(t.end_date) === year)} />
            )}
          </div>
        ))}
      </div>

      <div className="hub-rule mb-4" />
      <p className="hub-eyebrow mb-2">Countries</p>
      <div className="text-sm leading-relaxed">
        {stats.countries.map(([c, n]) => (
          <div key={c} className="flex items-center justify-between py-1 border-b hub-border">
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
  { id: 'archive', label: 'Archive' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'stats', label: 'Stats' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [trips, setTrips] = useState(null);
  const [tab, setTab] = useState('archive');
  const [openId, setOpenId] = useState(null);

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
      console.error(error);
      setTrips([]);
      return;
    }
    setTrips(data || []);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

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

  const open = useMemo(() => (trips || []).find((t) => t.id === openId) || null, [trips, openId]);

  if (checking) return <Spinner label="Checking your session" />;
  if (!session) return <SignIn />;
  if (!trips) return <Spinner label="Loading your trips" />;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--cream)' }}>
      <main className="flex-1 hub-scroll">
        {open ? (
          <TripDetail
            trip={open}
            userId={session.user.id}
            knownCities={knownCities}
            onBack={() => setOpenId(null)}
            onReload={load}
          />
        ) : tab === 'archive' ? (
          <Archive trips={past} onOpen={(t) => setOpenId(t.id)} />
        ) : tab === 'upcoming' ? (
          <Upcoming
            trips={upcoming}
            userId={session.user.id}
            knownCities={knownCities}
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
                  className="py-3 text-xs font-medium tracking-wide"
                  style={{
                    color: active ? 'var(--navy)' : 'var(--navy-45)',
                    borderTop: active ? '2px solid var(--navy)' : '2px solid transparent',
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
