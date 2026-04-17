'use client';

import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import {useDraftContext} from './DraftContext';
import {AgentTimeline} from './AgentTimeline';
import {WelcomeNoteEditor} from './WelcomeNoteEditor';
import {PeopleEditor} from './PeopleEditor';
import {ChecklistGrid} from './ChecklistGrid';
import {CritiquePanel} from './CritiquePanel';
import {SendToSlackButton} from './SendToSlackButton';
import {SaveIndicator} from './SaveIndicator';
import {Avatar} from './Avatar';

export function DraftWorkspaceHeader() {
  const {state, meta} = useDraftContext();
  const displayName = state.pkg.newHireName ?? meta.newHireId;
  return (
    <header style={headerStyle}>
      <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
        <Avatar name={displayName} src={state.pkg.newHireAvatarUrl} size={48} />
        <div style={{display: 'grid', gap: 4}}>
          <p style={eyebrowStyle}>Onboarding plan for</p>
          <h1 style={{margin: 0, fontSize: 28, lineHeight: 1.15}}>
            {displayName}
          </h1>
          <p style={{margin: 0, color: '#64748b', fontSize: 13}}>
            Updated {new Date(state.pkg.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>
      <SaveIndicator status={state.saveStatus} error={state.saveError} />
    </header>
  );
}

export function DraftWorkspaceBody({children}: {children: React.ReactNode}) {
  return <div style={{display: 'grid', gap: 20}}>{children}</div>;
}

export function DraftWorkspaceSidebar({children}: {children: React.ReactNode}) {
  return (
    <aside style={{display: 'grid', gap: 20, alignContent: 'start'}}>
      {children}
    </aside>
  );
}

export function DraftWorkspaceWelcomeNote() {
  const {state, actions} = useDraftContext();
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Welcome</h2>
      <WelcomeNoteEditor
        intro={state.pkg.welcomeIntro ?? state.pkg.sections.welcome.intro}
        note={state.pkg.welcomeNote}
        onIntroChange={(next) => actions.patch({welcomeIntro: next})}
        onNoteChange={(next) => actions.patch({welcomeNote: next})}
      />
    </section>
  );
}

export function DraftWorkspacePeople() {
  const {state, actions} = useDraftContext();
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>People to meet</h2>
      <PeopleEditor
        people={state.pkg.sections.peopleToMeet.people}
        onChange={(next) => actions.patch({peopleToMeet: next}, {flush: true})}
      />
    </section>
  );
}

export function DraftWorkspaceChecklistGrid() {
  const {state, actions} = useDraftContext();
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Onboarding checklist</h2>
      <ChecklistGrid
        pkg={state.pkg}
        onColumnChange={(sectionId, items) =>
          actions.patch({checklistRows: {[sectionId]: items}}, {flush: true})
        }
      />
    </section>
  );
}

export function DraftWorkspaceAgentTimeline() {
  const {state, actions} = useDraftContext();
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Agent activity</h2>
      <AgentTimeline events={state.agentEvents} />
      {!state.generating && state.agentEvents.length === 0 ? (
        <button
          type="button"
          onClick={actions.runGenerator}
          disabled={!state.generatorReady}
          style={{
            marginTop: 12,
            padding: '8px 14px',
            background: 'transparent',
            color: state.generatorReady ? '#7dd3fc' : '#64748b',
            border: `1px solid ${
              state.generatorReady
                ? 'rgba(56, 189, 248, 0.4)'
                : 'rgba(148, 163, 184, 0.2)'
            }`,
            borderRadius: 8,
            fontSize: 13,
            cursor: state.generatorReady ? 'pointer' : 'not-allowed',
          }}
        >
          {state.generatorReady
            ? 'Run generator'
            : 'No pending generator input'}
        </button>
      ) : null}
    </section>
  );
}

export function DraftWorkspaceCritiquePanel() {
  const {state, actions} = useDraftContext();
  return (
    <>
      <CritiquePanel
        findings={state.findings}
        status={state.critiqueStatus}
        errorMessage={state.critiqueError ?? undefined}
        onApply={actions.applyFix}
        onRerun={actions.runCritique}
      />
      {state.findings.length === 0 && state.critiqueStatus === 'idle' ? (
        <button
          type="button"
          onClick={actions.runCritique}
          style={{
            padding: '10px 14px',
            background: 'transparent',
            color: '#7dd3fc',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Ask agent to review
        </button>
      ) : null}
    </>
  );
}

export function DraftWorkspaceSendToSlack() {
  const {state, actions} = useDraftContext();
  const criticalFindings = useMemo(
    () => state.findings.filter((f) => f.severity === 'critical'),
    [state.findings]
  );
  const isPublished = state.pkg.status === 'published';
  if (isPublished) {
    return (
      <section style={sectionStyle}>
        <p style={{margin: 0, color: '#86efac', fontSize: 13}}>
          Published{' '}
          {state.pkg.publishedAt
            ? new Date(state.pkg.publishedAt).toLocaleString()
            : 'just now'}
          .
        </p>
      </section>
    );
  }
  return (
    <SendToSlackButton
      pkg={state.pkg}
      criticalFindings={criticalFindings}
      onPublished={() => {
        void actions.reload();
      }}
    />
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: 20,
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 14,
};

const sectionStyle: CSSProperties = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 14,
  padding: 18,
};

const sectionHeadingStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: '#94a3b8',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
