'use client';

import {useState} from 'react';

const MIN = 140;
const MAX = 600;

export function WelcomeNoteEditor({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const [local, setLocal] = useState(value ?? '');
  const length = local.length;
  const tooShort = length > 0 && length < MIN;
  const tooLong = length > MAX;

  return (
    <div style={{display: 'grid', gap: 8}}>
      <textarea
        value={local}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setLocal(value ?? '');
            onChange(value ?? '');
          }
        }}
        placeholder="Welcome, [first name]! A few sentences from their manager."
        rows={4}
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'rgba(30, 41, 59, 0.7)',
          color: '#e2e8f0',
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: 1.55,
          resize: 'vertical',
        }}
        aria-label="Welcome note"
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: tooShort || tooLong ? '#fca5a5' : '#94a3b8',
        }}
      >
        <span>
          {tooShort
            ? `${MIN - length} more characters`
            : tooLong
              ? `${length - MAX} over the limit`
              : 'Aim for 140–600 chars'}
        </span>
        <span>
          {length}/{MAX}
        </span>
      </div>
    </div>
  );
}
