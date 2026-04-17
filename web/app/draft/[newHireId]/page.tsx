import {notFound} from 'next/navigation';
import type {CSSProperties} from 'react';
import {requireManagerContext} from '../../../lib/session';
import {getDraft, SparkApiError} from '../../../lib/sparkApi';
import {DraftProvider} from '../../../components/DraftProvider';
import {
  DraftWorkspaceHeader,
  DraftWorkspaceBody,
  DraftWorkspaceWelcomeNote,
  DraftWorkspaceChecklist,
  DraftWorkspacePreview,
  DraftWorkspaceSidebar,
  DraftWorkspaceAgentTimeline,
  DraftWorkspaceCritiquePanel,
  DraftWorkspaceSendToSlack,
} from '../../../components/DraftWorkspace';

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
    <DraftProvider
      initialPackage={initialPackage}
      newHireId={newHireId}
      managerSlackId={ctx.managerSlackId}
    >
      <div style={outerStyle}>
        <DraftWorkspaceHeader />
        <div style={layoutGrid}>
          <DraftWorkspaceBody>
            <DraftWorkspaceWelcomeNote />
            <DraftWorkspaceChecklist />
            <DraftWorkspacePreview />
          </DraftWorkspaceBody>
          <DraftWorkspaceSidebar>
            <DraftWorkspaceAgentTimeline />
            <DraftWorkspaceCritiquePanel />
            <DraftWorkspaceSendToSlack />
          </DraftWorkspaceSidebar>
        </div>
      </div>
    </DraftProvider>
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
