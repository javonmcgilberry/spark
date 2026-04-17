'use client';

import {useState} from 'react';
import type {CSSProperties} from 'react';
import type {OnboardingPerson} from '../lib/types';
import type {SlackUserHit} from '../lib/sparkApi';
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

export function PeopleEditor({
  people,
  onChange,
}: {
  people: OnboardingPerson[];
  onChange: (next: OnboardingPerson[]) => void;
}) {
  const update = (index: number, patch: Partial<OnboardingPerson>) => {
    onChange(people.map((p, i) => (i === index ? {...p, ...patch} : p)));
  };
  const remove = (index: number) => {
    onChange(people.filter((_, i) => i !== index));
  };
  const add = (hit: SlackUserHit) => {
    if (people.some((p) => p.slackUserId === hit.slackUserId)) return;
    const next: OnboardingPerson = {
      name: hit.displayName || hit.name,
      role: hit.title || 'Teammate',
      discussionPoints: '',
      weekBucket: 'week1-2',
      kind: 'teammate',
      slackUserId: hit.slackUserId,
      email: hit.email,
      avatarUrl: hit.avatarUrl,
      insightsStatus: 'pending',
    };
    onChange([...people, next]);
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
}: {
  person: OnboardingPerson;
  onChange: (patch: Partial<OnboardingPerson>) => void;
  onRemove: () => void;
}) {
  const isPending =
    person.insightsStatus === 'pending' &&
    !person.askMeAbout &&
    !person.discussionPoints;
  const blurb = person.askMeAbout ?? person.discussionPoints ?? '';

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
    </div>
  );
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
