import type {OnboardingPerson} from '../lib/types';

export function PeopleRow({person}: {person: OnboardingPerson}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 4,
        padding: 12,
        borderRadius: 10,
        border: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'rgba(30, 41, 59, 0.5)',
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between'}}>
        <strong style={{fontSize: 14}}>{person.name}</strong>
        <span style={{fontSize: 12, color: '#64748b'}}>
          {person.weekBucket}
        </span>
      </div>
      <p style={{margin: 0, color: '#94a3b8', fontSize: 12}}>{person.role}</p>
      <p style={{margin: '4px 0 0', color: '#cbd5e1', fontSize: 13}}>
        {person.discussionPoints}
      </p>
      {person.slackUserId ? (
        <p
          style={{
            margin: '4px 0 0',
            color: '#64748b',
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}
        >
          Slack: {person.slackUserId}
        </p>
      ) : null}
    </div>
  );
}
