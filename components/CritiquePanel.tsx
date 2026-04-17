'use client';

import {useState} from 'react';
import type {DraftFieldPatch} from '../lib/types';
import type {Finding, FindingSeverity} from '../lib/agents/critique';

export type CritiqueStatus = 'idle' | 'running' | 'error';

export function CritiquePanel({
  findings,
  status,
  errorMessage,
  onApply,
  onRerun,
}: {
  findings: Finding[];
  status: CritiqueStatus;
  errorMessage?: string;
  onApply: (patch: DraftFieldPatch) => void;
  onRerun: () => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const active = findings.filter((finding) => !dismissed.has(finding.id));
  const running = status === 'running';

  if (status === 'error') {
    return (
      <section style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p style={{margin: 0, color: '#fca5a5', fontSize: 13}}>
            Critique failed{errorMessage ? ` — ${errorMessage}` : ''}
          </p>
          <button type="button" onClick={onRerun} style={subtleBtnStyle}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (active.length === 0 && !running) {
    return (
      <section style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p style={{margin: 0, color: '#86efac', fontSize: 13}}>
            No issues flagged.
          </p>
          <button type="button" onClick={onRerun} style={subtleBtnStyle}>
            Rerun critique
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <strong style={{fontSize: 14}}>
          {running
            ? 'Reviewing…'
            : `${active.length} finding${active.length === 1 ? '' : 's'}`}
        </strong>
        <button
          type="button"
          onClick={onRerun}
          disabled={running}
          style={subtleBtnStyle}
        >
          Rerun
        </button>
      </div>
      <div style={{display: 'grid', gap: 8}}>
        {active.map((finding) => (
          <FindingRow
            key={finding.id}
            finding={finding}
            onApply={onApply}
            onDismiss={() =>
              setDismissed((prev) => new Set(prev).add(finding.id))
            }
          />
        ))}
      </div>
    </section>
  );
}

function FindingRow({
  finding,
  onApply,
  onDismiss,
}: {
  finding: Finding;
  onApply: (patch: DraftFieldPatch) => void;
  onDismiss: () => void;
}) {
  const color = severityColor(finding.severity);
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: color.bg,
        border: `1px solid ${color.border}`,
        display: 'grid',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: 10,
            color: color.fg,
            fontWeight: 700,
          }}
        >
          {finding.severity}
        </span>
        <span style={{fontSize: 11, color: '#64748b'}}>{finding.field}</span>
      </div>
      <p style={{margin: 0, color: '#e2e8f0', fontSize: 13, lineHeight: 1.5}}>
        {finding.issue}
      </p>
      <div style={{display: 'flex', gap: 8}}>
        {finding.proposedFix ? (
          <button
            type="button"
            onClick={() => onApply(finding.proposedFix!)}
            style={{
              padding: '4px 10px',
              background: color.fg,
              color: '#0f172a',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Apply fix
          </button>
        ) : null}
        <button type="button" onClick={onDismiss} style={subtleBtnStyle}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function severityColor(severity: FindingSeverity) {
  switch (severity) {
    case 'critical':
      return {
        bg: 'rgba(248, 113, 113, 0.12)',
        fg: '#fca5a5',
        border: 'rgba(248, 113, 113, 0.4)',
      };
    case 'warn':
      return {
        bg: 'rgba(250, 204, 21, 0.12)',
        fg: '#fde68a',
        border: 'rgba(250, 204, 21, 0.4)',
      };
    default:
      return {
        bg: 'rgba(148, 163, 184, 0.1)',
        fg: '#cbd5e1',
        border: 'rgba(148, 163, 184, 0.3)',
      };
  }
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 14,
  padding: 16,
};

const subtleBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  color: '#cbd5e1',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};
