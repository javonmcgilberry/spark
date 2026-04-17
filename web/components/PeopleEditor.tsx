'use client';

import {useState} from 'react';
import type {CSSProperties} from 'react';
import type {InsightAttempt, OnboardingPerson} from '../lib/types';
import type {InsightHints, SlackUserHit} from '../lib/sparkApi';
import {Avatar} from './Avatar';
import {SlackUserPicker} from './SlackUserPicker';

const BUCKETS: Array<OnboardingPerson['weekBucket']> = [
  'week1-2',
  'week2-3',
  'week3+',
];

const BUCKET_LABELS: Record<OnboardingPerson['weekBucket'], string> = {
  'week1-2': 'Week 1–2',
  'week2-3': 'Week 2–3',
  'week3+': 'Week 3+',
};

const BUCKET_ORDER: Record<OnboardingPerson['weekBucket'], number> = {
  'week1-2': 0,
  'week2-3': 1,
  'week3+': 2,
};

function sortByBucket(people: OnboardingPerson[]): OnboardingPerson[] {
  return people
    .map((person, index) => ({person, index}))
    .sort((a, b) => {
      const delta =
        BUCKET_ORDER[a.person.weekBucket] - BUCKET_ORDER[b.person.weekBucket];
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((entry) => entry.person);
}

export type RetryPersonInsights = (
  slackUserId: string,
  hints: InsightHints
) => Promise<void>;

export function PeopleEditor({
  people,
  onChange,
  onRetryPerson,
}: {
  people: OnboardingPerson[];
  onChange: (next: OnboardingPerson[]) => void;
  onRetryPerson?: RetryPersonInsights;
}) {
  const emit = (next: OnboardingPerson[]) => onChange(sortByBucket(next));
  const update = (index: number, patch: Partial<OnboardingPerson>) => {
    emit(people.map((p, i) => (i === index ? {...p, ...patch} : p)));
  };
  const remove = (index: number) => {
    emit(people.filter((_, i) => i !== index));
  };
  const add = (hit: SlackUserHit) => {
    if (people.some((p) => p.slackUserId === hit.slackUserId)) return;
    const next: OnboardingPerson = {
      name: hit.displayName || hit.name,
      role: hit.title || 'Teammate',
      discussionPoints: '',
      weekBucket: 'week3+',
      kind: 'teammate',
      slackUserId: hit.slackUserId,
      email: hit.email,
      avatarUrl: hit.avatarUrl,
      insightsStatus: 'pending',
    };
    emit([...people, next]);
  };

  return (
    <div style={{display: 'grid', gap: 10}}>
      {people.length === 0 ? (
        <p style={{margin: 0, color: '#64748b', fontSize: 13}}>
          No people yet. Add a teammate below.
        </p>
      ) : null}
      {people.map((person, index) => (
        <PersonRow
          key={person.slackUserId ?? `${person.name}-${index}`}
          person={person}
          onChange={(patch) => update(index, patch)}
          onRemove={() => remove(index)}
          onRetryPerson={onRetryPerson}
        />
      ))}
      <AddPersonRow onAdd={add} />
    </div>
  );
}

function PersonRow({
  person,
  onChange,
  onRemove,
  onRetryPerson,
}: {
  person: OnboardingPerson;
  onChange: (patch: Partial<OnboardingPerson>) => void;
  onRemove: () => void;
  onRetryPerson?: RetryPersonInsights;
}) {
  const [assigning, setAssigning] = useState(false);
  const isPlaceholder = !person.slackUserId;
  const isPending =
    person.insightsStatus === 'pending' &&
    !person.askMeAbout &&
    !person.discussionPoints;
  const canRetry = Boolean(onRetryPerson && person.slackUserId);
  const blurb = person.askMeAbout ?? person.discussionPoints ?? '';

  if (assigning) {
    return (
      <div style={rowStyle}>
        <div style={{display: 'grid', gap: 8}}>
          <span style={{fontSize: 11, color: '#94a3b8'}}>
            Pick a Slack teammate for the {person.role} slot
          </span>
          <SlackUserPicker
            value={null}
            placeholder="Search for a teammate…"
            autoFocus
            onChange={(hit) => {
              if (!hit) return;
              onChange({
                name: hit.displayName || hit.name,
                role: hit.title || person.role,
                title: hit.title,
                slackUserId: hit.slackUserId,
                email: hit.email,
                avatarUrl: hit.avatarUrl,
                insightsStatus: 'pending',
              });
              setAssigning(false);
            }}
          />
          <div style={{display: 'flex', justifyContent: 'flex-end'}}>
            <button
              type="button"
              onClick={() => setAssigning(false)}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={rowStyle}>
      <div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
        <Avatar name={person.name} src={person.avatarUrl} size={36} />
        <div style={{display: 'grid', gap: 2, flex: 1, minWidth: 0}}>
          <strong style={{fontSize: 14, color: '#e2e8f0'}}>
            {person.name}
          </strong>
          <span style={{fontSize: 12, color: '#94a3b8'}}>{person.role}</span>
        </div>
        {isPlaceholder ? (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            style={assignBtnStyle}
          >
            Assign teammate
          </button>
        ) : null}
        <select
          value={person.weekBucket}
          onChange={(event) =>
            onChange({
              weekBucket: event.target.value as OnboardingPerson['weekBucket'],
            })
          }
          aria-label={`Week for ${person.name}`}
          style={selectStyle}
        >
          {BUCKETS.map((b) => (
            <option key={b} value={b}>
              {BUCKET_LABELS[b]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${person.name}`}
          style={removeBtnStyle}
        >
          Remove
        </button>
      </div>
      {isPending ? (
        <div style={skeletonStyle} aria-label="Loading insights" />
      ) : (
        <textarea
          value={blurb}
          onChange={(event) =>
            onChange({
              discussionPoints: event.target.value,
              askMeAbout: undefined,
            })
          }
          placeholder="What this person contributes, what to ask them, what they own."
          rows={2}
          style={textareaStyle}
          aria-label={`Discussion points for ${person.name}`}
        />
      )}
      {canRetry ? (
        <TroubleshootPanel person={person} onRetryPerson={onRetryPerson!} />
      ) : null}
    </div>
  );
}

function TroubleshootPanel({
  person,
  onRetryPerson,
}: {
  person: OnboardingPerson;
  onRetryPerson: RetryPersonInsights;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(person.email ?? '');
  const [githubUsername, setGithubUsername] = useState(
    defaultGithubGuess(person.email)
  );
  const [jiraTicketKey, setJiraTicketKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div style={{display: 'flex', justifyContent: 'flex-end'}}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={helpLinkStyle}
        >
          Not quite right? Retry with hints
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!person.slackUserId) return;
    setStatus('running');
    setError(null);
    const hints: InsightHints = {
      email: email.trim() || undefined,
      githubUsername: githubUsername.trim() || undefined,
      jiraTicketKey: jiraTicketKey.trim() || undefined,
    };
    try {
      await onRetryPerson(person.slackUserId, hints);
      setStatus('idle');
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'retry failed');
    }
  };

  return (
    <div style={troubleshootStyle}>
      <div style={{display: 'grid', gap: 4}}>
        <strong style={diagnosisHeadingStyle}>
          Why Spark couldn&apos;t help
        </strong>
        <p style={diagnosisBodyStyle}>
          {diagnosisFor(person.insightsAttempts ?? [])}
        </p>
      </div>
      <div style={{display: 'grid', gap: 8}}>
        <HintInput
          label="Work email (for Jira)"
          value={email}
          placeholder="the email Jira knows them by"
          onChange={setEmail}
        />
        <HintInput
          label="GitHub username"
          value={githubUsername}
          placeholder="e.g. matthewk"
          onChange={setGithubUsername}
        />
        <HintInput
          label="Jira ticket key (optional)"
          value={jiraTicketKey}
          placeholder="e.g. PLAT-1234 — a ticket they own"
          onChange={setJiraTicketKey}
        />
      </div>
      {error ? <p style={errorBannerStyle}>{error}</p> : null}
      <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setStatus('idle');
            setError(null);
          }}
          disabled={status === 'running'}
          style={cancelButtonStyle}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={status === 'running'}
          style={retryButtonStyle}
        >
          {status === 'running' ? 'Retrying…' : 'Retry with hints'}
        </button>
      </div>
    </div>
  );
}

function HintInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <label style={{display: 'grid', gap: 4}}>
      <span style={hintLabelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={hintInputStyle}
      />
    </label>
  );
}

function diagnosisFor(attempts: InsightAttempt[]): string {
  const lines: string[] = [];
  for (const attempt of attempts) {
    const source = attempt.kind === 'jira' ? 'Jira' : 'GitHub';
    if (attempt.reason === 'not_configured') {
      lines.push(`${source} isn’t configured on the bot.`);
      continue;
    }
    if (attempt.reason === 'no_email') {
      lines.push(
        `${source} needs ${attempt.kind === 'jira' ? 'an email' : 'a GitHub handle'} — Spark didn’t have one to try.`
      );
      continue;
    }
    if (attempt.reason === 'lookup_failed') {
      lines.push(`${source} lookup for ${attempt.input} failed.`);
      continue;
    }
    lines.push(
      `Tried ${source} with ${attempt.input} → found ${attempt.count} ${pluralize(source === 'Jira' ? 'ticket' : 'PR', attempt.count)}.`
    );
  }
  if (lines.length === 0) {
    return 'No record of what Spark tried. Provide hints below to retry.';
  }
  return lines.join(' ');
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function defaultGithubGuess(email: string | undefined): string {
  if (!email) return '';
  const local = email.split('@')[0];
  return local ? local.replace(/\./g, '-').toLowerCase() : '';
}

function AddPersonRow({onAdd}: {onAdd: (hit: SlackUserHit) => void}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={addButtonStyle}
      >
        + Add person
      </button>
    );
  }

  return (
    <div style={{...rowStyle, borderStyle: 'dashed'}}>
      <SlackUserPicker
        value={null}
        placeholder="Search for a teammate to add…"
        autoFocus
        onChange={(hit) => {
          if (hit) {
            onAdd(hit);
            setOpen(false);
          }
        }}
      />
      <div style={{display: 'flex', justifyContent: 'flex-end'}}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={cancelButtonStyle}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(30, 41, 59, 0.5)',
};

const selectStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 12,
};

const textareaStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  resize: 'vertical',
  width: '100%',
};

const removeBtnStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const assignBtnStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: '#7dd3fc',
  border: '1px solid rgba(56, 189, 248, 0.35)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const addButtonStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'transparent',
  color: '#7dd3fc',
  border: '1px dashed rgba(56, 189, 248, 0.4)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'left' as const,
};

const cancelButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: '#cbd5e1',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const skeletonStyle: CSSProperties = {
  height: 32,
  borderRadius: 6,
  background:
    'linear-gradient(90deg, rgba(148,163,184,0.08) 0%, rgba(148,163,184,0.18) 50%, rgba(148,163,184,0.08) 100%)',
  backgroundSize: '200% 100%',
};

const helpLinkStyle: CSSProperties = {
  padding: 0,
  background: 'transparent',
  color: '#64748b',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
  textDecoration: 'underline dotted',
  textUnderlineOffset: 3,
};

const troubleshootStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid rgba(250, 204, 21, 0.25)',
  background: 'rgba(250, 204, 21, 0.06)',
};

const diagnosisHeadingStyle: CSSProperties = {
  fontSize: 11,
  color: '#fde68a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};

const diagnosisBodyStyle: CSSProperties = {
  margin: 0,
  color: '#cbd5e1',
  fontSize: 12,
  lineHeight: 1.5,
};

const hintLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
};

const hintInputStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 12,
  width: '100%',
};

const retryButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: '#38bdf8',
  color: '#0f172a',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const errorBannerStyle: CSSProperties = {
  margin: 0,
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(248, 113, 113, 0.12)',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  color: '#fca5a5',
  fontSize: 12,
};
