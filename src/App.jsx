import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  KINDS,
  countriesOf,
  dateRange,
  dayHeading,
  daysUntil,
  isMappable,
  itemsToText,
  mapsUrl,
  nightsBetween,
  parseBullets,
  placeName,
  todayISO,
  yearOf,
} from './helpers';

/* ==========================================================================
   Small shared pieces
   ========================================================================== */

function Spinner({ label = 'Loading' }) {
  return (
    <div className="py-16 text-center hub-faint text-sm" role="status">
      {label}…
    </div>
  );
}

function Button({ children, onClick, variant = 'solid', type = 'button', disabled }) {
  const base = 'px-4 py-2 text-sm font-medium rounded-sm transition-colors disabled:opacity-40';
  const styles =
    variant === 'solid'
      ? { backgroundColor: 'var(--navy)', color: 'var(--cream)' }
      : { backgroundColor: 'transparent', color: 'var(--navy)', border: '1px solid var(--navy-20)' };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base} style={styles}>
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

/* ==========================================================================
   Sign in
   ========================================================================== */

function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  async function send() {
    if (!email.trim()) return;
    setState('sending');
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-7 max-w-md mx-auto">
      <p className="hub-eyebrow mb-3">Trip archive</p>
      <h1 className="hub-display text-5xl leading-none mb-4">Hub</h1>
      <p className="hub-muted text-sm leading-relaxed mb-8">
        Everywhere you've been, and what you did there.
      </p>

      {state === 'sent' ? (
        <div className="hub-card p-4">
          <p className="text-sm leading-relaxed">
            Check <span className="font-medium">{email}</span> for a sign-in link. It's good for about an hour.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="you@example.com"
              className="hub-input w-full px-3 py-2.5 text-base"
            />
          </Field>
          <Button onClick={send} disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a link'}
          </Button>
          {error && <p className="text-sm" style={{ color: '#a33' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Item row — the tappable line that opens Google Maps
   ========================================================================== */

function ItemRow({ item, city, depth = 0 }) {
  const mappable = isMappable(item);
  const glyph = (KINDS[item.kind] || KINDS.other).glyph;

  const inner = (
    <>
      <span className="hub-faint text-[10px] leading-5 w-3 shrink-0 text-center" aria-hidden="true">
        {glyph}
      </span>
      <span className="flex-1 min-w-0">
        <span className={mappable ? 'underline decoration-dotted underline-offset-2' : ''}>
          {item.title}
        </span>
        {item.time_label && <span className="hub-faint text-xs ml-2 whitespace-nowrap">{item.time_label}</span>}
        {item.notes && (
          <span className="block hub-muted text-xs leading-snug mt-0.5 italic">{item.notes}</span>
        )}
      </span>
    </>
  );

  const padding = { paddingLeft: depth > 0 ? '1.25rem' : 0 };

  return mappable ? (
    <a
      href={mapsUrl(item, city)}
      target="_blank"
      rel="noreferrer"
      className="flex gap-2 py-1 text-sm items-baseline"
      style={padding}
      title={`Open ${placeName(item.title)} in Google Maps`}
    >
      {inner}
    </a>
  ) : (
    <div className="flex gap-2 py-1 text-sm items-baseline" style={padding}>
      {inner}
    </div>
  );
}

/* ==========================================================================
   Day editor — bullets by default, Tab to nest
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
      .map((line) => {
        if (direction > 0) return `  ${line}`;
        return line.replace(/^ {1,2}/, '');
      })
      .join('\n');

    const next = value.slice(0, from) + block + value.slice(to);
    apply(next, Math.max(from, selectionStart + direction * 2));
  }

  function onKeyDown(e) {
    const ta = e.target;
    const { selectionStart, selectionEnd, value } = ta;

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

      // Enter on an empty bullet outdents, then clears — same as any outliner
      if (/^\s*-\s*$/.test(currentLine)) {
        if (indent.length > 0) {
          shift(-1);
          return;
        }
        const next = `${value.slice(0, lineStart)}\n${value.slice(selectionEnd)}`;
        apply(next, lineStart + 1);
        return;
      }

      const insert = `\n${indent}- `;
      const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
      apply(next, selectionStart + insert.length);
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
        <span className="hub-eyebrow">Editing {day.label || dayHeading(day.date)}</span>
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
        autoCapitalize="sentences"
        className="hub-input w-full px-3 py-2 text-sm leading-relaxed font-body"
        style={{ whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
      />

      <p className="hub-faint text-xs mt-2 leading-relaxed">
        Enter starts the next bullet, Tab nests it. Add a time after a comma
        (<span className="italic">Dinner @ Kink, 8.30PM</span>) and a comment after a dash
        (<span className="italic">- great, cheap</span>). Paste a Google Maps share and the link sticks.
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

  const days = useMemo(
    () => [...(trip.days || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [trip]
  );

  const itemCount = days.reduce((n, d) => n + (d.items?.length || 0), 0);
  const nights = nightsBetween(trip.start_date, trip.end_date);

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
      // parents first, so the self-reference resolves
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
      label: null,
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
    if (!confirm(`Delete ${day.label || dayHeading(day.date)} and everything on it?`)) return;
    await supabase.from('days').delete().eq('id', day.id);
    await onReload();
  }

  const cityFor = (day) => day.city || trip.city || trip.title;

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-2">
        <button onClick={onBack} className="hub-muted text-sm mb-5">
          ← Archive
        </button>

        <p className="hub-eyebrow mb-2">{dateRange(trip.start_date, trip.end_date)}</p>
        <h1 className="hub-display text-4xl leading-tight mb-2">{trip.title}</h1>
        <p className="hub-muted text-xs">
          {countriesOf(trip).join(' · ') || '—'}
          {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
          {itemCount ? ` · ${itemCount} entries` : ''}
        </p>
      </div>

      <div className="hub-rule mx-5 my-4" />

      <div className="px-5 pb-8">
        {days.length === 0 && (
          <div className="hub-card p-4 mb-4">
            <p className="text-sm leading-relaxed mb-3">
              Nothing recorded for this trip yet. Add a day and start filling it in.
            </p>
            <Button onClick={() => setAddingDay(true)}>Add a day</Button>
          </div>
        )}

        {days.map((day) => {
          const items = [...(day.items || [])].sort((a, b) => a.sort_order - b.sort_order);
          const roots = items.filter((i) => !i.parent_id);
          const childrenOf = (id) => items.filter((i) => i.parent_id === id);
          const isEditing = editingDay === day.id;

          return (
            <div key={day.id} className="mb-6">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  {day.label || dayHeading(day.date) || 'Untitled day'}
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
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="hub-eyebrow flex items-center gap-2"
            >
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
                    return (
                      <p key={i} className="break-words">
                        {before && <span>{before} </span>}
                        <a href={url[0]} target="_blank" rel="noreferrer" className="underline">
                          {new URL(url[0]).hostname.replace(/^www\./, '')}
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
   Archive — years, with every destination visible without drilling in
   ========================================================================== */

function SearchResults({ trips, query, onOpen }) {
  const q = query.trim().toLowerCase();

  const hits = useMemo(() => {
    const out = [];
    trips.forEach((trip) => {
      const tripMatch =
        trip.title.toLowerCase().includes(q) ||
        (trip.country || '').toLowerCase().includes(q) ||
        (trip.city || '').toLowerCase().includes(q);

      const places = [];
      (trip.days || []).forEach((d) =>
        (d.items || []).forEach((i) => {
          if (i.title.toLowerCase().includes(q)) places.push(i.title);
        })
      );

      if (tripMatch || places.length) out.push({ trip, places: places.slice(0, 4), more: Math.max(0, places.length - 4) });
    });
    return out.sort((a, b) => (b.trip.start_date || '').localeCompare(a.trip.start_date || ''));
  }, [trips, q]);

  if (!hits.length) {
    return <p className="hub-faint text-sm px-5 py-8">Nothing matching “{query}”.</p>;
  }

  return (
    <div className="px-5 pb-8">
      <p className="hub-eyebrow mb-3">
        {hits.length} trip{hits.length === 1 ? '' : 's'}
      </p>
      {hits.map(({ trip, places, more }) => (
        <button
          key={trip.id}
          onClick={() => onOpen(trip)}
          className="w-full text-left py-3 border-b hub-border"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="hub-display text-lg">{trip.title}</span>
            <span className="hub-faint text-xs shrink-0">{yearOf(trip.start_date)}</span>
          </div>
          {places.length > 0 && (
            <p className="hub-muted text-xs mt-1 leading-relaxed">
              {places.join(' · ')}
              {more > 0 && ` · +${more} more`}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function Archive({ trips, onOpen }) {
  const [query, setQuery] = useState('');

  const byYear = useMemo(() => {
    const map = new Map();
    trips.forEach((t) => {
      const y = yearOf(t.start_date) ?? 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(t);
    });
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => [year, list.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))]);
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

      {query.trim() ? (
        <SearchResults trips={trips} query={query} onOpen={onOpen} />
      ) : (
        <div className="px-5 pb-8">
          {byYear.map(([year, list]) => (
            <section key={year} className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="hub-display text-2xl leading-none">{year || '—'}</h2>
                <div className="hub-rule flex-1" />
                <span className="hub-faint text-xs">{list.length}</span>
              </div>

              {list.map((trip) => {
                const count = (trip.days || []).reduce((n, d) => n + (d.items?.length || 0), 0);
                return (
                  <button
                    key={trip.id}
                    onClick={() => onOpen(trip)}
                    className="w-full text-left py-2.5 flex items-baseline justify-between gap-3 border-b hub-border"
                  >
                    <span className="min-w-0">
                      <span className="text-[15px] font-medium">{trip.title}</span>
                      {count === 0 && (
                        <span className="hub-faint text-xs ml-2 italic">not filled in</span>
                      )}
                      <span className="block hub-faint text-xs mt-0.5">
                        {countriesOf(trip).join(' · ')}
                      </span>
                    </span>
                    <span className="hub-muted text-xs shrink-0 whitespace-nowrap">
                      {dateRange(trip.start_date, trip.end_date).replace(` ${year}`, '')}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Upcoming
   ========================================================================== */

function Upcoming({ trips, onOpen, onReload, userId }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', country: '', start_date: '', end_date: '' });
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
    });
    setSaving(false);
    if (error) {
      alert(`Couldn't add that trip: ${error.message}`);
      return;
    }
    setForm({ title: '', country: '', start_date: '', end_date: '' });
    setAdding(false);
    await onReload();
  }

  return (
    <div className="px-5 pt-4 pb-8">
      <h1 className="hub-display text-3xl mb-4">Coming up</h1>

      {trips.length === 0 && !adding && (
        <p className="hub-muted text-sm leading-relaxed mb-5">
          Nothing booked. Add a destination and dates — you can fill in the days later.
        </p>
      )}

      {trips.map((trip) => {
        const away = daysUntil(trip.start_date);
        return (
          <button
            key={trip.id}
            onClick={() => onOpen(trip)}
            className="w-full text-left hub-card p-4 mb-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="hub-display text-2xl">{trip.title}</span>
              <span className="hub-eyebrow shrink-0">
                {away === 0 ? 'today' : away === 1 ? 'tomorrow' : `${away} days`}
              </span>
            </div>
            <p className="hub-muted text-xs mt-1.5">
              {dateRange(trip.start_date, trip.end_date)}
              {countriesOf(trip).length ? ` · ${countriesOf(trip).join(' · ')}` : ''}
            </p>
          </button>
        );
      })}

      {adding ? (
        <div className="hub-card p-4 mt-3 space-y-3">
          <Field label="Destination">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Copenhagen"
              className="hub-input w-full px-3 py-2 text-base"
            />
          </Field>
          <Field label="Country">
            <input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="Denmark — separate multiples with ;"
              className="hub-input w-full px-3 py-2 text-base"
            />
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
  const past = trips.filter((t) => t.start_date <= todayISO());

  const stats = useMemo(() => {
    const perYear = new Map();
    const countries = new Map();
    let nights = 0;
    const places = new Map();

    past.forEach((t) => {
      const y = yearOf(t.start_date);
      if (y) {
        if (!perYear.has(y)) perYear.set(y, { trips: 0, nights: 0 });
        perYear.get(y).trips += 1;
        perYear.get(y).nights += nightsBetween(t.start_date, t.end_date) || 0;
      }
      countriesOf(t).forEach((c) => countries.set(c, (countries.get(c) || 0) + 1));
      nights += nightsBetween(t.start_date, t.end_date) || 0;

      (t.days || []).forEach((d) =>
        (d.items || []).forEach((i) => {
          if (i.kind === 'food' || i.kind === 'drink') {
            const n = placeName(i.title);
            if (n.length > 2) places.set(n, (places.get(n) || 0) + 1);
          }
        })
      );
    });

    return {
      perYear: [...perYear.entries()].sort((a, b) => b[0] - a[0]),
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      nights,
      repeat: [...places.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 8),
      entries: past.reduce((n, t) => n + (t.days || []).reduce((m, d) => m + (d.items?.length || 0), 0), 0),
    };
  }, [past]);

  const maxTrips = Math.max(1, ...stats.perYear.map(([, v]) => v.trips));

  return (
    <div className="px-5 pt-4 pb-8">
      <h1 className="hub-display text-3xl mb-6">The tally</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          [past.length, 'trips'],
          [stats.countries.length, 'countries'],
          [stats.nights, 'nights away'],
          [stats.entries, 'things logged'],
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
      <p className="text-sm leading-relaxed mb-8">
        {stats.countries.map(([c, n], i) => (
          <span key={c}>
            {i > 0 && <span className="hub-faint"> · </span>}
            {c}
            {n > 1 && <span className="hub-faint text-xs"> ×{n}</span>}
          </span>
        ))}
      </p>

      {stats.repeat.length > 0 && (
        <>
          <div className="hub-rule mb-4" />
          <p className="hub-eyebrow mb-2">Been back for more</p>
          <div className="text-sm leading-relaxed">
            {stats.repeat.map(([name, n]) => (
              <div key={name} className="flex justify-between py-0.5 border-b hub-border">
                <span className="truncate pr-3">{name}</span>
                <span className="hub-faint text-xs shrink-0">×{n}</span>
              </div>
            ))}
          </div>
        </>
      )}
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
      upcoming: all
        .filter((x) => x.start_date > t)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    };
  }, [trips]);

  const open = useMemo(() => (trips || []).find((t) => t.id === openId) || null, [trips, openId]);

  if (checking) return <Spinner label="Checking your session" />;
  if (!session) return <SignIn />;
  if (!trips) return <Spinner label="Loading your trips" />;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--cream)' }}>
      <main className="flex-1 hub-scroll" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {open ? (
          <TripDetail
            trip={open}
            userId={session.user.id}
            onBack={() => setOpenId(null)}
            onReload={load}
          />
        ) : tab === 'archive' ? (
          <Archive trips={past} onOpen={(t) => setOpenId(t.id)} />
        ) : tab === 'upcoming' ? (
          <Upcoming
            trips={upcoming}
            userId={session.user.id}
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
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
          >
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
