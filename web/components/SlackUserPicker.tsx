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
import type {SlackUserHit} from '../lib/sparkApi';

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
  const inputId = useId();
  const listboxId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (value && value.displayName !== query) {
      setQuery(value.displayName);
    }
    // only when value changes from outside
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
      const body = (await res.json()) as {users: SlackUserHit[]};
      setHits(body.users);
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

  return (
    <div style={{position: 'relative'}}>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value && event.target.value !== value.displayName) {
            onChange(null);
          }
        }}
        onFocus={() => {
          setOpen(true);
          if (hits.length === 0) void runSearch(query);
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
      {value ? (
        <div style={badgeStyle}>
          <span>{value.slackUserId}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
              setOpen(true);
            }}
            style={clearBtnStyle}
            aria-label="Clear selection"
          >
            ×
          </button>
        </div>
      ) : null}

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
            <li style={{...rowStyle, color: '#94a3b8'}}>No matches</li>
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

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 6,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(56, 189, 248, 0.14)',
  color: '#7dd3fc',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
};

const clearBtnStyle: CSSProperties = {
  background: 'transparent',
  color: '#7dd3fc',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
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
