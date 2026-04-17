'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type {SlackUserHit} from '../lib/services/slackUserDirectory';

const DEBOUNCE_MS = 250;

export function SlackUserPicker({
  value,
  onChange,
  placeholder = 'Search the Slack workspace…',
  autoFocus,
}: {
  value: SlackUserHit | null;
  onChange: (next: SlackUserHit | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(value?.displayName ?? '');
  const [hits, setHits] = useState<SlackUserHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const inputId = useId();
  const listboxId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!value) {
      setQuery('');
      setHits([]);
      setError(null);
    }
    // only when selection is cleared from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.slackUserId]);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/lookup/slack-users?q=${encodeURIComponent(q)}&limit=10`,
        {signal: controller.signal}
      );
      if (!res.ok) throw new Error(`lookup failed (${res.status})`);
      const body = (await res.json()) as {
        users: SlackUserHit[];
        partial?: boolean;
      };
      setHits(body.users);
      setPartial(Boolean(body.partial));
      setHighlight(0);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'lookup failed');
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Don't fire a lookup for an empty query. The old behavior paginated
    // the whole Slack directory just to surface a generic alphabetical
    // slice on focus — a free Tier 2 crawl per page mount when the
    // user hadn't even typed yet. Wait for a real keystroke.
    if (query.trim().length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open, runSearch]);

  function pick(hit: SlackUserHit) {
    onChange(hit);
    setQuery(hit.displayName);
    setOpen(false);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && hits[highlight]) {
        event.preventDefault();
        pick(hits[highlight]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div style={selectedCardStyle} aria-label="Selected new hire">
        <div style={{display: 'grid', gap: 2, minWidth: 0, flex: 1}}>
          <strong style={selectedNameStyle}>
            {value.name || value.displayName}
          </strong>
          <span style={selectedMetaStyle}>
            {[value.title, value.email]
              .filter((part): part is string => Boolean(part))
              .join(' · ') || value.slackUserId}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery('');
            setHits([]);
            setOpen(false);
            setError(null);
          }}
          style={clearBtnStyle}
          aria-label="Clear selection"
          title="Clear"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div style={{position: 'relative'}}>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          // Only run a lookup on focus if the user has already typed
          // something and we somehow don't have results for it. Empty
          // query → do nothing; user types → useEffect picks it up.
          if (query.trim().length > 0 && hits.length === 0) {
            void runSearch(query);
          }
        }}
        onBlur={() => {
          // delay so clicks on options land before we close
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && hits[highlight] ? `${listboxId}-${highlight}` : undefined
        }
        style={inputStyle}
      />

      {open && (hits.length > 0 || loading || error) ? (
        <ul id={listboxId} role="listbox" style={listboxStyle}>
          {loading && hits.length === 0 ? (
            <li style={{...rowStyle, color: '#94a3b8'}}>Searching…</li>
          ) : null}
          {error ? (
            <li style={{...rowStyle, color: '#fca5a5'}}>Error: {error}</li>
          ) : null}
          {hits.map((hit, index) => (
            <li
              key={hit.slackUserId}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                // mousedown fires before blur; intentional
                event.preventDefault();
                pick(hit);
              }}
              onMouseEnter={() => setHighlight(index)}
              style={{
                ...rowStyle,
                background:
                  index === highlight
                    ? 'rgba(56, 189, 248, 0.14)'
                    : 'transparent',
              }}
            >
              <div style={{display: 'grid', gap: 2}}>
                <strong style={{fontSize: 14}}>{hit.displayName}</strong>
                <span style={{fontSize: 12, color: '#94a3b8'}}>
                  {[hit.title, hit.email, hit.slackUserId]
                    .filter((part): part is string => Boolean(part))
                    .slice(0, 2)
                    .join(' · ')}
                </span>
              </div>
            </li>
          ))}
          {!loading && hits.length === 0 && !error ? (
            <li style={{...rowStyle, color: '#94a3b8'}}>
              {query.trim().length === 0
                ? 'Type a name, display name, or email'
                : partial
                  ? 'Workspace directory is still loading. Try again in a moment.'
                  : 'No matches'}
            </li>
          ) : null}
          {partial && hits.length > 0 ? (
            <li
              style={{
                ...rowStyle,
                color: '#94a3b8',
                fontSize: 11,
                fontStyle: 'italic',
              }}
            >
              Partial results — workspace directory is still loading.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(30, 41, 59, 0.7)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 14,
  width: '100%',
};

const selectedCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(56, 189, 248, 0.35)',
  background: 'rgba(56, 189, 248, 0.08)',
};

const selectedNameStyle: CSSProperties = {
  fontSize: 14,
  color: '#e2e8f0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const selectedMetaStyle: CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const clearBtnStyle: CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 6,
  width: 26,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};

const listboxStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  margin: 0,
  padding: 4,
  listStyle: 'none',
  background: 'rgba(15, 23, 42, 0.98)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 8,
  maxHeight: 280,
  overflowY: 'auto',
  zIndex: 50,
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.45)',
};

const rowStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#e2e8f0',
};
