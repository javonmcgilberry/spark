'use client';

import {useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import type {GeneratorEvent} from '../lib/agents/generator';

const TOOL_LABELS: Record<string, string> = {
  resolve_new_hire: 'Resolving new hire',
  resolve_team: 'Looking up team',
  fetch_team_roster: 'Fetching team roster',
  propose_buddy: 'Proposing buddy',
  find_stakeholders: 'Finding stakeholders',
  find_contribution_tasks: 'Scanning for contribution tasks',
  draft_welcome_note: 'Drafting welcome note',
  tune_checklist: 'Tuning checklist',
  finalize_draft: 'Finalizing draft',
};

type StepStatus = 'running' | 'done' | 'failed' | 'retrying';

interface Step {
  tool: string;
  iteration: number;
  status: StepStatus;
  input?: unknown;
  preview?: unknown;
  error?: string;
  durationMs?: number;
  validationRetries: number;
  thinking: string[];
}

interface Folded {
  steps: Step[];
  headline: 'running' | 'done' | 'error';
  totalMs: number;
  finalError?: string;
}

function foldEvents(events: GeneratorEvent[]): Folded {
  const steps: Step[] = [];
  const keyFor = (tool: string, iteration: number) => `${iteration}:${tool}`;
  const byKey = new Map<string, Step>();
  let headline: Folded['headline'] = 'running';
  let totalMs = 0;
  let finalError: string | undefined;

  for (const event of events) {
    if (event.type === 'tool_call') {
      const step: Step = {
        tool: event.tool,
        iteration: event.iteration,
        status: 'running',
        input: event.input,
        validationRetries: 0,
        thinking: [],
      };
      const key = keyFor(event.tool, event.iteration);
      byKey.set(key, step);
      steps.push(step);
    } else if (event.type === 'tool_result') {
      const key = keyFor(event.tool, event.iteration);
      const step = byKey.get(key);
      if (step) {
        step.status = event.ok ? 'done' : 'failed';
        step.durationMs = event.durationMs;
        step.preview = event.preview;
        step.error = event.error;
        if (typeof event.durationMs === 'number') {
          totalMs += event.durationMs;
        }
      }
    } else if (event.type === 'validation_error') {
      const lastFinalize = [...steps]
        .reverse()
        .find((s) => s.tool === 'finalize_draft');
      if (lastFinalize) {
        lastFinalize.status = 'retrying';
        lastFinalize.validationRetries += 1;
      }
    } else if (event.type === 'thinking') {
      const lastStep = steps[steps.length - 1];
      if (lastStep) lastStep.thinking.push(event.text);
    } else if (event.type === 'error') {
      headline = 'error';
      finalError = event.message;
    } else if (event.type === 'done' || event.type === 'draft_persisted') {
      if (headline !== 'error') headline = 'done';
    }
  }

  return {steps, headline, totalMs, finalError};
}

export function AgentTimeline({events}: {events: GeneratorEvent[]}) {
  const folded = useMemo(() => foldEvents(events), [events]);

  if (events.length === 0) {
    return (
      <div style={emptyStyle}>
        Agent timeline will appear here when generation starts.
      </div>
    );
  }

  return (
    <div style={{display: 'grid', gap: 10}}>
      <ProgressPill
        headline={folded.headline}
        stepCount={folded.steps.length}
        totalMs={folded.totalMs}
      />
      <ol style={listStyle}>
        {folded.steps.map((step, index) => (
          <StepCard
            key={`${step.iteration}:${step.tool}:${index}`}
            step={step}
          />
        ))}
      </ol>
      {folded.headline === 'error' && folded.finalError ? (
        <p style={errorFooter}>{folded.finalError}</p>
      ) : null}
    </div>
  );
}

function ProgressPill({
  headline,
  stepCount,
  totalMs,
}: {
  headline: Folded['headline'];
  stepCount: number;
  totalMs: number;
}) {
  const label =
    headline === 'running'
      ? `Running · ${stepCount} step${stepCount === 1 ? '' : 's'}`
      : headline === 'done'
        ? `Done · ${stepCount} step${stepCount === 1 ? '' : 's'}`
        : 'Error';
  const palette =
    headline === 'running'
      ? {bg: 'rgba(56, 189, 248, 0.14)', fg: '#7dd3fc'}
      : headline === 'done'
        ? {bg: 'rgba(34, 197, 94, 0.14)', fg: '#86efac'}
        : {bg: 'rgba(248, 113, 113, 0.16)', fg: '#fca5a5'};
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 10px',
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 12,
        fontWeight: 600,
        alignSelf: 'start',
      }}
    >
      <StatusDot
        status={
          headline === 'running'
            ? 'running'
            : headline === 'done'
              ? 'done'
              : 'failed'
        }
      />
      <span>{label}</span>
      {totalMs > 0 ? (
        <span style={{color: 'inherit', opacity: 0.75}}>
          · {formatDuration(totalMs)}
        </span>
      ) : null}
    </div>
  );
}

function StepCard({step}: {step: Step}) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[step.tool] ?? step.tool;
  const hasDetail =
    step.input !== undefined ||
    step.preview !== undefined ||
    step.error !== undefined ||
    step.thinking.length > 0;

  return (
    <li style={cardStyle(step.status)}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          ...cardHeaderStyle,
          cursor: hasDetail ? 'pointer' : 'default',
        }}
      >
        <span style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <StatusDot status={step.status} />
          <span style={{fontSize: 13, color: '#e2e8f0'}}>{label}</span>
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#64748b',
          }}
        >
          {step.validationRetries > 0 ? (
            <span style={{color: '#fde68a'}}>
              retry × {step.validationRetries}
            </span>
          ) : null}
          {typeof step.durationMs === 'number' && step.durationMs > 0 ? (
            <span>{formatDuration(step.durationMs)}</span>
          ) : null}
          {hasDetail ? <span>{open ? '▾' : '▸'}</span> : null}
        </span>
      </button>
      {open && hasDetail ? (
        <div style={detailStyle}>
          {step.error ? <pre style={errorPreStyle}>{step.error}</pre> : null}
          {step.input !== undefined ? (
            <DetailBlock label="Input" value={step.input} />
          ) : null}
          {step.preview !== undefined ? (
            <DetailBlock label="Result" value={step.preview} />
          ) : null}
          {step.thinking.length > 0 ? (
            <div style={{display: 'grid', gap: 4}}>
              <span style={detailLabelStyle}>Thinking</span>
              {step.thinking.map((text, i) => (
                <p key={i} style={thinkingStyle}>
                  {text}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function DetailBlock({label, value}: {label: string; value: unknown}) {
  const serialized = formatValue(value);
  return (
    <div style={{display: 'grid', gap: 4}}>
      <span style={detailLabelStyle}>{label}</span>
      <pre style={preStyle}>{serialized}</pre>
    </div>
  );
}

function formatValue(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2) ?? String(value);
    const lines = json.split('\n');
    if (lines.length <= 20) return json;
    return (
      lines.slice(0, 20).join('\n') + `\n… (${lines.length - 20} more lines)`
    );
  } catch {
    return String(value);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusDot({status}: {status: StepStatus}) {
  const color =
    status === 'running'
      ? '#7dd3fc'
      : status === 'done'
        ? '#86efac'
        : status === 'retrying'
          ? '#fde68a'
          : '#fca5a5';
  return (
    <span
      aria-hidden
      className={status === 'running' ? 'spark-pulse' : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
      }}
    />
  );
}

const emptyStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 13,
  padding: '8px 0',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
};

function cardStyle(status: StepStatus): CSSProperties {
  const accent =
    status === 'running'
      ? '#7dd3fc'
      : status === 'done'
        ? '#86efac'
        : status === 'retrying'
          ? '#fde68a'
          : '#fca5a5';
  return {
    borderLeft: `3px solid ${accent}`,
    borderRadius: 6,
    background: 'rgba(30, 41, 59, 0.55)',
    overflow: 'hidden',
  };
}

const cardHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  textAlign: 'left' as const,
};

const detailStyle: CSSProperties = {
  padding: '4px 12px 12px',
  display: 'grid',
  gap: 10,
  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
};

const detailLabelStyle: CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 700,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: 8,
  borderRadius: 6,
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#cbd5e1',
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 220,
  overflow: 'auto',
};

const errorPreStyle: CSSProperties = {
  ...preStyle,
  background: 'rgba(248, 113, 113, 0.1)',
  color: '#fca5a5',
};

const thinkingStyle: CSSProperties = {
  margin: 0,
  color: '#cbd5e1',
  fontSize: 12,
  lineHeight: 1.5,
  fontStyle: 'italic',
};

const errorFooter: CSSProperties = {
  margin: 0,
  color: '#fca5a5',
  fontSize: 12,
};
