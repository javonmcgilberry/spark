import type {CSSProperties} from 'react';

const tasks = [
  {
    title: 'Remove stale flag ff-apai-2247-deny-openrouter-requests',
    type: 'Stale flag',
    detail: 'Disabled in Statsig, still referenced in feature-config defaults.',
  },
  {
    title: 'Add CODEOWNERS rule for packages/utilities/PageBuildUtils',
    type: 'Ownership gap',
    detail: 'Good first contribution that teaches review routing.',
  },
  {
    title: 'Clean up stale TODO in packages/systems/permissions/site.ts',
    type: 'Repo cleanup',
    detail: 'Old TODO comment in a high-signal team-owned file.',
  },
];

const timeline = [
  'Day 1: Welcome, team map, setup links',
  'Day 2-3: Tools, rituals, and people to meet',
  'Day 4-5: Reading plan and repo orientation',
  'Contribution milestone: choose a scoped first task',
];

export default function HomePage() {
  return (
    <main style={{maxWidth: 1080, margin: '0 auto', padding: '48px 24px 80px'}}>
      <div style={{display: 'grid', gap: 32}}>
        <section style={panelStyle}>
          <p style={eyebrowStyle}>Spark</p>
          <h1 style={headingStyle}>Your onboarding dashboard</h1>
          <p style={bodyStyle}>
            Browse your onboarding progress, docs, and contribution
            opportunities in one place.
          </p>
        </section>

        <section style={gridStyle}>
          <article style={panelStyle}>
            <p style={sectionLabelStyle}>Journey</p>
            <ul style={listStyle}>
              {timeline.map((item) => (
                <li key={item} style={listItemStyle}>
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article style={panelStyle}>
            <p style={sectionLabelStyle}>Docs and orientation</p>
            <ul style={listStyle}>
              <li style={listItemStyle}>Developer Onboarding</li>
              <li style={listItemStyle}>Eng Onboarding Buddy</li>
              <li style={listItemStyle}>
                Frontend / Backend / Infra resource hub
              </li>
              <li style={listItemStyle}>
                Tools, rituals, and channel guidance
              </li>
            </ul>
          </article>
        </section>

        <section style={panelStyle}>
          <p style={sectionLabelStyle}>Contribution tasks</p>
          <div style={taskListStyle}>
            {tasks.map((task) => (
              <article key={task.title} style={taskCardStyle}>
                <div style={taskHeaderStyle}>
                  <strong>{task.title}</strong>
                  <span style={pillStyle}>{task.type}</span>
                </div>
                <p style={{margin: 0, color: '#cbd5e1'}}>{task.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

const panelStyle: CSSProperties = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.35)',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 24,
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
};

const eyebrowStyle: CSSProperties = {
  margin: '0 0 8px',
  color: '#38bdf8',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 12,
};

const headingStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: '2.5rem',
  lineHeight: 1.05,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: '#cbd5e1',
  maxWidth: 720,
  fontSize: '1rem',
  lineHeight: 1.6,
};

const sectionLabelStyle: CSSProperties = {
  margin: '0 0 16px',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 12,
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: '#e2e8f0',
  display: 'grid',
  gap: 10,
};

const listItemStyle: CSSProperties = {
  lineHeight: 1.5,
};

const taskCardStyle: CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 16,
  padding: 16,
  display: 'grid',
  gap: 8,
  background: 'rgba(30, 41, 59, 0.7)',
};

const taskListStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
};

const taskHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
};

const pillStyle: CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(56, 189, 248, 0.35)',
  color: '#7dd3fc',
  padding: '4px 10px',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
