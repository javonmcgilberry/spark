import {notFound} from 'next/navigation';
import type {CSSProperties} from 'react';
import {requireManagerSession} from '../../../lib/session';
import {buildRouteCtx} from '../../../lib/routeCtx';
import {enrichPackageInsights} from '../../../lib/handlers/drafts/enrich';
import {DraftProvider} from '../../../components/DraftProvider';
import {
  DraftWorkspaceHeader,
  DraftWorkspaceBody,
  DraftWorkspaceWelcomeNote,
  DraftWorkspacePeople,
  DraftWorkspaceChecklist,
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
  const {ctx} = await buildRouteCtx();
  const session = await requireManagerSession(ctx);

  const pkg = await ctx.db.get(newHireId);
  if (!pkg) notFound();
  const initialPackage = enrichPackageInsights(ctx, pkg);

  return (
    <DraftProvider
      initialPackage={initialPackage}
      newHireId={newHireId}
      managerSlackId={session.managerSlackId}
    >
      <div style={outerStyle}>
        <DraftWorkspaceHeader />
        <div style={layoutGrid}>
          <DraftWorkspaceBody>
            <DraftWorkspaceWelcomeNote />
            <DraftWorkspacePeople />
            <DraftWorkspaceChecklist />
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
