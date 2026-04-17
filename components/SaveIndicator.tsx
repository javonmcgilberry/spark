'use client';

import type {SaveStatus} from '../lib/useDraft';

export function SaveIndicator({
  status,
  error,
}: {
  status: SaveStatus;
  error: string | null;
}) {
  const {label, color} = statusMeta(status, error);
  return (
    <span
      style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        border: `1px solid ${color.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      role="status"
      aria-live="polite"
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color.fg,
        }}
      />
      {label}
    </span>
  );
}

function statusMeta(status: SaveStatus, error: string | null) {
  switch (status) {
    case 'saving':
      return {
        label: 'Saving…',
        color: {
          bg: 'rgba(56, 189, 248, 0.14)',
          fg: '#7dd3fc',
          border: 'rgba(56, 189, 248, 0.35)',
        },
      };
    case 'saved':
      return {
        label: 'Saved',
        color: {
          bg: 'rgba(34, 197, 94, 0.14)',
          fg: '#86efac',
          border: 'rgba(34, 197, 94, 0.35)',
        },
      };
    case 'dirty':
      return {
        label: 'Unsaved changes',
        color: {
          bg: 'rgba(250, 204, 21, 0.14)',
          fg: '#fde68a',
          border: 'rgba(250, 204, 21, 0.35)',
        },
      };
    case 'error':
      return {
        label: error ? `Error — ${error}` : 'Error — retry',
        color: {
          bg: 'rgba(248, 113, 113, 0.16)',
          fg: '#fca5a5',
          border: 'rgba(248, 113, 113, 0.4)',
        },
      };
    default:
      return {
        label: 'Ready',
        color: {
          bg: 'rgba(148, 163, 184, 0.12)',
          fg: '#cbd5e1',
          border: 'rgba(148, 163, 184, 0.25)',
        },
      };
  }
}
