'use client';

import type {GeneratorEvent} from '../lib/agents/generator';

const TOOL_LABELS: Record<string, string> = {
  resolve_new_hire: 'Resolving new hire',
  resolve_team: 'Looking up team',
  fetch_team_roster: 'Fetching team roster',
  propose_buddy: 'Proposing buddy candidates',
  find_stakeholders: 'Finding stakeholders',
  find_contribution_tasks: 'Scanning for contribution tasks',
  draft_welcome_note: 'Drafting welcome note',
  tune_checklist: 'Tuning checklist',
  finalize_draft: 'Finalizing draft',
};

export function AgentTimeline({events}: {events: GeneratorEvent[]}) {
  if (events.length === 0) {
    return (
      <div style={{color: '#64748b', fontSize: 13}}>
        Agent timeline will appear here when generation starts.
      </div>
    );
  }
  return (
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gap: 8,
      }}
    >
      {events.map((event, index) => (
        <li
          key={index}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            gap: 12,
            alignItems: 'center',
            padding: '8px 12px',
            borderLeft: `3px solid ${dotColor(event)}`,
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: dotColor(event),
            }}
          />
          <span style={{color: '#e2e8f0', fontSize: 13}}>
            {formatEvent(event)}
          </span>
          {'durationMs' in event &&
          typeof event.durationMs === 'number' &&
          event.durationMs > 0 ? (
            <span style={{color: '#64748b', fontSize: 11}}>
              {event.durationMs}ms
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function formatEvent(event: GeneratorEvent): string {
  switch (event.type) {
    case 'started':
      return 'Agent loop started.';
    case 'tool_call':
      return TOOL_LABELS[event.tool] ?? event.tool;
    case 'tool_result':
      if (event.ok) {
        return `✓ ${TOOL_LABELS[event.tool] ?? event.tool}`;
      }
      return `✗ ${TOOL_LABELS[event.tool] ?? event.tool}${event.error ? ' — ' + event.error : ''}`;
    case 'thinking':
      return event.text.slice(0, 160);
    case 'draft_ready':
      return 'Draft ready. Persisting…';
    case 'draft_persisted':
      return 'Draft saved.';
    case 'validation_error':
      return 'Schema validation failed — agent retrying.';
    case 'error':
      return `Error: ${event.message}`;
    case 'done':
      return `Done (${event.iterations} iteration${event.iterations === 1 ? '' : 's'}).`;
  }
}

function dotColor(event: GeneratorEvent): string {
  switch (event.type) {
    case 'error':
    case 'validation_error':
      return '#f87171';
    case 'draft_persisted':
    case 'draft_ready':
    case 'done':
      return '#86efac';
    case 'tool_result':
      return event.ok ? '#7dd3fc' : '#f87171';
    default:
      return '#94a3b8';
  }
}
