import type {OnboardingPackage} from '../lib/types';
import {PeopleRow} from './PeopleRow';

const SECTION_STYLE = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 14,
  padding: 20,
};

export function DraftPreview({pkg}: {pkg: OnboardingPackage}) {
  const welcome = pkg.sections.welcome;
  const people = pkg.sections.peopleToMeet.people;
  const checklist = pkg.sections.onboardingChecklist.sections;
  const tasks = pkg.sections.initialEngineeringTasks.tasks;
  const custom = pkg.customChecklistItems ?? [];

  return (
    <div style={{display: 'grid', gap: 16}}>
      <section style={SECTION_STYLE}>
        <p style={eyebrow}>Welcome</p>
        <h2 style={{margin: '0 0 8px', fontSize: 22}}>{welcome.title}</h2>
        <p style={body}>{welcome.intro}</p>
        {welcome.personalizedNote ? (
          <blockquote
            style={{
              margin: '12px 0 0',
              padding: '12px 14px',
              borderLeft: '3px solid #38bdf8',
              background: 'rgba(56, 189, 248, 0.08)',
              color: '#e2e8f0',
              fontStyle: 'italic',
              borderRadius: 4,
            }}
          >
            {welcome.personalizedNote}
          </blockquote>
        ) : null}
      </section>

      <section style={SECTION_STYLE}>
        <p style={eyebrow}>People to meet ({people.length})</p>
        <div style={{display: 'grid', gap: 10}}>
          {people.map((person) => (
            <PeopleRow
              key={`${person.slackUserId ?? person.name}`}
              person={person}
            />
          ))}
        </div>
      </section>

      <section style={SECTION_STYLE}>
        <p style={eyebrow}>
          Checklist ({checklist.length} sections · {custom.length} custom)
        </p>
        <div style={{display: 'grid', gap: 10}}>
          {checklist.map((section) => (
            <div key={section.id}>
              <strong style={{fontSize: 13, color: '#cbd5e1'}}>
                {section.title}
              </strong>
              <p style={{margin: '2px 0 6px', color: '#64748b', fontSize: 12}}>
                {section.goal}
              </p>
              <ul style={{margin: 0, paddingLeft: 18, color: '#cbd5e1'}}>
                {section.items.slice(0, 3).map((item, i) => (
                  <li key={i} style={{fontSize: 13, lineHeight: 1.5}}>
                    {item.label}
                  </li>
                ))}
                {section.items.length > 3 ? (
                  <li style={{fontSize: 12, color: '#64748b'}}>
                    +{section.items.length - 3} more
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section style={SECTION_STYLE}>
        <p style={eyebrow}>First contribution tasks ({tasks.length})</p>
        {tasks.length === 0 ? (
          <p style={body}>Scanner hasn&apos;t found tasks for this team yet.</p>
        ) : (
          <div style={{display: 'grid', gap: 8}}>
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  padding: 12,
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 10,
                  background: 'rgba(30, 41, 59, 0.5)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <strong style={{fontSize: 13}}>{task.title}</strong>
                  <span style={pillStyle(task.difficulty)}>
                    {task.difficulty}
                  </span>
                </div>
                <p style={{margin: '4px 0 0', color: '#94a3b8', fontSize: 12}}>
                  {task.rationale}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  margin: '0 0 12px',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 11,
  fontWeight: 700,
};

const body: React.CSSProperties = {
  margin: 0,
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.55,
};

function pillStyle(difficulty: string): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background:
      difficulty === 'easy'
        ? 'rgba(34, 197, 94, 0.18)'
        : 'rgba(250, 204, 21, 0.18)',
    color: difficulty === 'easy' ? '#86efac' : '#fde68a',
  };
}
