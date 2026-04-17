'use client';

import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import {useDraftContext} from './DraftContext';
import {DraftPreview} from './DraftPreview';
import {AgentTimeline} from './AgentTimeline';
import {WelcomeNoteEditor} from './WelcomeNoteEditor';
import {ChecklistEditor} from './ChecklistEditor';
import {CritiquePanel} from './CritiquePanel';
import {SendToSlackButton} from './SendToSlackButton';
import {SaveIndicator} from './SaveIndicator';

export function DraftWorkspaceHeader() {
  const {state, meta} = useDraftContext();
  return (
    <header style={headerStyle}>
      <div style={{display: 'grid', gap: 4}}>
        <p style={eyebrowStyle}>
          Onboarding plan for{' '}
          <strong style={{color: '#e2e8f0'}}>{meta.newHireId}</strong>
        </p>
        <h1 style={{margin: 0, fontSize: 28, lineHeight: 1.15}}>
          {state.pkg.sections.welcome.title}
        </h1>
        <p style={{margin: 0, color: '#64748b', fontSize: 13}}>
          Manager {meta.managerSlackId} · updated{' '}
          {new Date(state.pkg.updatedAt).toLocaleString()}
        </p>
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
      <h2 style={sectionHeadingStyle}>Welcome note</h2>
      <WelcomeNoteEditor
        value={state.pkg.welcomeNote}
        onChange={(next) => actions.patch({welcomeNote: next})}
      />
    </section>
  );
}

export function DraftWorkspaceChecklist() {
  const {state, actions} = useDraftContext();
  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadingStyle}>Custom checklist items</h2>
      <ChecklistEditor
        items={state.pkg.customChecklistItems ?? []}
        onChange={(next) =>
          actions.patch({customChecklistItems: next}, {flush: true})
        }
      />
    </section>
  );
}

export function DraftWorkspacePreview() {
  const {state} = useDraftContext();
  return <DraftPreview pkg={state.pkg} />;
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
