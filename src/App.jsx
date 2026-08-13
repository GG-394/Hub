import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { COUNTRY_NAMES, countryFlag } from './countries';
import {
  countriesOf,
  dateRange,
  dayHeading,
  daysUntil,
  isMappable,
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

const ICON_PATHS = {
  food: 'M4 2v7a2 2 0 0 0 4 0V2M6 9v13M13 2c-1 0-2 1-2 3v4h4V5c0-2-1-3-2-3ZM13 9v13',
  drink: 'M4 4h16l-8 9v7M8 20h8',
  plane: 'M2 13l20-7-4 8 4 8-20-7',
  route: 'M6 3v13a4 4 0 0 0 4 4h8M14 16l4 4-4 4',
  stay: 'M2 18v-5h20v5M2 13V8m20 5V9a2 2 0 0 0-2-2h-6v6M6 9h3',
  pin: 'M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z',
  dot: 'M12 10a2 2 0 1 0 .01 0',
};

function Icon({ name, size = 13 }) {
  const d = ICON_PATHS[name] || ICON_PATHS.pin;
  const filled = name === 'pin';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 1.6 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
      {name === 'pin' && <circle cx="12" cy="10" r="2.4" />}
    </svg>
  );
}

/** Which icon a line gets. Travel splits into flights and everything else. */
function iconFor(item) {
  const t = (item.title || '').toLowerCase();
  if (item.kind === 'travel' || /^(fly|flight)\b/.test(t)) {
    if (/\b(fly|flight|airport|plane)\b/.test(t)) return 'plane';
    return 'route';
  }
  if (item.kind === 'food') return 'food';
  if (item.kind === 'drink') return 'drink';
  if (item.kind === 'stay') return 'stay';
  return isMappable(item) ? 'pin' : 'dot';
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

function Flags({ trip }) {
  const flags = countriesOf(trip).map(countryFlag).filter(Boolean);
  if (!flags.length) return null;
  return (
    <span className="shrink-0" style={{ fontSize: '15px', letterSpacing: '1px' }} aria-hidden="true">
      {flags.join('')}
    </span>
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

function ItemRow({ item, city, depth = 0 }) {
  const url = mapsUrl(item, city);
  const icon = iconFor(item);

  const body = (
    <>
      <span className="hub-faint mt-0.5">
        <Icon name={icon} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={url ? 'underline decoration-dotted underline-offset-2' : ''}>
          {item.title}
        </span>
        {item.time_label && (
          <span className="hub-faint text-xs ml-2 whitespace-nowrap">{item.time_label}</span>
        )}
        {item.notes && (
          <span className="block hub-muted text-xs leading-snug mt-0.5 italic">{item.notes}</span>
        )}
      </span>
    </>
  );

  const wrap = depth > 0 ? { marginLeft: '18px', paddingLeft: '10px', borderLeft: '1px solid var(--navy-10)' } : {};

  return (
    <div style={wrap}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex gap-2 py-1 text-sm items-start">
          {body}
        </a>
      ) : (
        <div className="flex gap-2 py-1 text-sm items-start">{body}</div>
      )}
    </div>
  );
}

/* ==========================================================================
   Day editor
   ========================================================================== */

function DayEditor({ day, items, onSave, onCancel }) {
  const [text, setText] = useState(() => itemsToText(items) || '- ');
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
    await onSave(parseBullets(text));
    setSaving(false);
  }

  return (
    <div className="hub-card p-3 my-2">
      <div className="flex items-center justify-between mb-2">
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
        Enter starts the next bullet, Tab nests it. Time after a comma
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

function TripDetail({ trip, onBack, onReload, userId }) {
  const [editingDay, setEditingDay] = useState(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState(trip.end_date || trip.start_date);
  const [showNotes, setShowNotes] = useState(false);
  const [editingWho, setEditingWho] = useState(false);
  const [who, setWho] = useState(trip.companions || '');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summary, setSummary] = useState(trip.summary || '');

  const days = useMemo(
    () => [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [trip]
  );

  const nights = nightsBetween(trip.start_date, trip.end_date);

  async function saveWho() {
    const { error } = await supabase
      .from('trips')
      .update({ companions: who.trim() || null })
      .eq('id', trip.id);
    if (error) {
      alert(`Couldn't save that: ${error.message}`);
      return;
    }
    setEditingWho(false);
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

  async function saveDay(day, rows) {
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

  const cityFor = (day) => day.city || trip.city || trip.title;

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-2">
        <button onClick={onBack} className="hub-muted text-sm mb-5">
          ← Back
        </button>

        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="hub-eyebrow">{dateRange(trip.start_date, trip.end_date)}</p>
          <Flags trip={trip} />
        </div>
        <h1 className="hub-display text-4xl leading-tight mb-2">{trip.title}</h1>
        <p className="hub-muted text-xs">
          {countriesOf(trip).join(' · ') || '—'}
          {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
        </p>

        <div className="mt-3">
          {editingWho ? (
            <div className="flex items-center gap-2">
              <input
                value={who}
                onChange={(e) => setWho(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveWho()}
                placeholder="Who came along?"
                autoFocus
                className="hub-input flex-1 px-2 py-1 text-sm"
              />
              <Button onClick={saveWho}>Save</Button>
            </div>
          ) : (
            <button onClick={() => setEditingWho(true)} className="text-xs hub-muted">
              {trip.companions ? (
                <>
                  <span className="hub-eyebrow mr-2">With</span>
                  {trip.companions}
                </>
              ) : (
                <span className="hub-faint underline">+ Add who you went with</span>
              )}
            </button>
          )}
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

        {days.map((day) => {
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
                  {day.city && <span className="hub-faint font-normal ml-2">{day.city}</span>}
                </h2>
                <div className="flex gap-3 shrink-0">
                  {!isEditing && (
                    <button onClick={() => setEditingDay(day.id)} className="hub-faint text-xs">
                      Edit
                    </button>
                  )}
                  <button onClick={() => deleteDay(day)} className="hub-faint text-xs">
                    Delete
                  </button>
                </div>
              </div>

              {isEditing ? (
                <DayEditor
                  day={day}
                  items={items}
                  onSave={(rows) => saveDay(day, rows)}
                  onCancel={() => setEditingDay(null)}
                />
              ) : items.length === 0 ? (
                <p className="hub-faint text-sm py-1 italic">Empty — tap Edit to fill it in.</p>
              ) : (
                <div>
                  {roots.map((item) => (
                    <React.Fragment key={item.id}>
                      <ItemRow item={item} city={cityFor(day)} />
                      {childrenOf(item.id).map((child) => (
                        <ItemRow key={child.id} item={child} city={cityFor(day)} depth={1} />
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
        <span className="hub-display text-2xl leading-tight">{trip.title}</span>
        <span className="flex items-center gap-2 shrink-0">
          <Flags trip={trip} />
          {away != null && (
            <span className="hub-eyebrow">
              {away === 0 ? 'today' : away === 1 ? 'tomorrow' : `${away}d`}
            </span>
          )}
        </span>
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

function Stats({ trips }) {
  const past = useMemo(() => trips.filter((t) => t.start_date <= todayISO()), [trips]);

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
      <p className="hub-eyebrow mb-2">Trips per year</p>
      <div className="mb-8">
        {stats.perYear.map(([year, v]) => (
          <Bar
            key={year}
            label={String(year).slice(2)}
            value={v.trips}
            max={maxTrips}
            note={`${v.trips} · ${v.nights}n`}
          />
        ))}
      </div>

      <div className="hub-rule mb-4" />
      <p className="hub-eyebrow mb-2">Countries</p>
      <div className="text-sm leading-relaxed">
        {stats.countries.map(([c, n]) => (
          <div key={c} className="flex items-center justify-between py-1 border-b hub-border">
            <span>
              <span className="mr-2" aria-hidden="true">
                {countryFlag(c)}
              </span>
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
          <TripDetail trip={open} userId={session.user.id} onBack={() => setOpenId(null)} onReload={load} />
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
          <Stats trips={trips} />
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
