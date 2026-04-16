import {notFound} from 'next/navigation';
import type {CSSProperties} from 'react';
import {requireManagerContext} from '../../../lib/session';
import {getDraft, SparkApiError} from '../../../lib/sparkApi';
import {DraftWorkspace} from '../../../components/DraftWorkspace';

export const dynamic = 'force-dynamic';

export default async function DraftPage({
  params,
}: {
  params: Promise<{newHireId: string}>;
}) {
  const {newHireId} = await params;
  const ctx = await requireManagerContext();

  let initialPackage;
  try {
    initialPackage = await getDraft(
      {env: ctx.env, managerSlackId: ctx.managerSlackId},
      newHireId
    );
  } catch (error) {
    if (error instanceof SparkApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <DraftWorkspace.Root
      initialPackage={initialPackage}
      newHireId={newHireId}
      managerSlackId={ctx.managerSlackId}
    >
      <div style={outerStyle}>
        <DraftWorkspace.Header />
        <div style={layoutGrid}>
          <DraftWorkspace.Body>
            <DraftWorkspace.WelcomeNote />
            <DraftWorkspace.Checklist />
            <DraftWorkspace.Preview />
          </DraftWorkspace.Body>
          <DraftWorkspace.Sidebar>
            <DraftWorkspace.AgentTimeline />
            <DraftWorkspace.CritiquePanel />
            <DraftWorkspace.SendToSlack />
          </DraftWorkspace.Sidebar>
        </div>
      </div>
    </DraftWorkspace.Root>
  );
}

const outerStyle: CSSProperties = {
  display: 'grid',
  gap: 20,
  maxWidth: 1200,
  margin: '0 auto',
};

const layoutGrid: CSSProperties = {
  display: 'grid',
  gap: 20,
  gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 380px)',
};
