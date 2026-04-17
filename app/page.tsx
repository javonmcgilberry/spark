import Link from 'next/link';
import {getSessionDetails, type AccessDiagnostic} from '../lib/session';
import {buildRouteCtx} from '../lib/routeCtx';
import {resolveFromSlack} from '../lib/services/identityResolver';
import {enrichPackageInsights} from '../lib/handlers/drafts/enrich';
import {Avatar} from '../components/Avatar';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const {ctx} = await buildRouteCtx();
  const {session, access} = await getSessionDetails(ctx);
  if (!session) {
    return (
      <EmptyState title="No manager session" body={describeNoSession(access)} />
    );
  }

  let drafts = await ctx.db.listDraftsForManager(session.managerSlackId);
  let publishedPackages = (
    await ctx.db.listPackagesManagedBy(session.managerSlackId)
  ).filter((pkg) => pkg.status === 'published');
  drafts = drafts.map((pkg) => enrichPackageInsights(ctx, pkg));
  publishedPackages = publishedPackages.map((pkg) =>
    enrichPackageInsights(ctx, pkg)
  );

  let meName: string | null = null;
  let fetchError: string | null = null;
  try {
    const me = await resolveFromSlack(ctx, session.managerSlackId);
    meName = me.displayName || me.firstName;
  } catch (error) {
    fetchError = error instanceof Error ? error.message : 'Unknown error';
  }

  return (
    <div style={{maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 24}}>
      <section style={panelStyle}>
        <p style={eyebrowStyle}>
          Signed in as{' '}
          <strong style={{color: '#e2e8f0'}}>
            {meName ?? session.managerSlackId}
          </strong>
          {session.source === 'env' ? (
            <span
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                background: 'rgba(56, 189, 248, 0.18)',
                borderRadius: 999,
                fontSize: 11,
                color: '#7dd3fc',
              }}
            >
              demo mode
            </span>
          ) : null}
        </p>
        <h1 style={headingStyle}>
          {drafts.length === 0 && publishedPackages.length === 0
            ? 'Draft your first onboarding plan'
            : 'Your onboarding plans'}
        </h1>
        <p style={bodyStyle}>
          Give the agent a new hire&apos;s name and team hint. It will look up
          the team, pick a buddy, draft the welcome, tune the checklist, and
          send a reviewable plan to Slack.
        </p>
        <Link
          href="/new"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 18px',
            background: '#38bdf8',
            color: '#0f172a',
            textDecoration: 'none',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          Create onboarding plan
        </Link>
      </section>

      {fetchError ? (
        <section
          style={{...panelStyle, borderColor: 'rgba(248, 113, 113, 0.4)'}}
        >
          <p style={sectionLabelStyle}>Profile lookup failed</p>
          <p style={bodyStyle}>{fetchError}</p>
        </section>
      ) : null}

      <section style={panelStyle}>
        <p style={sectionLabelStyle}>Open drafts ({drafts.length})</p>
        {drafts.length === 0 ? (
          <p style={bodyStyle}>No drafts in progress.</p>
        ) : (
          <div style={{display: 'grid', gap: 12}}>
            {drafts.map((pkg) => (
              <DraftRow key={pkg.userId} pkg={pkg} variant="draft" />
            ))}
          </div>
        )}
      </section>

      <section style={panelStyle}>
        <p style={sectionLabelStyle}>
          Published plans ({publishedPackages.length})
        </p>
        {publishedPackages.length === 0 ? (
          <p style={bodyStyle}>Nothing published yet.</p>
        ) : (
          <div style={{display: 'grid', gap: 12}}>
            {publishedPackages.map((pkg) => (
              <DraftRow key={pkg.userId} pkg={pkg} variant="published" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftRow({
  pkg,
  variant,
}: {
  pkg: {
    userId: string;
    updatedAt: string;
    welcomeNote?: string;
    newHireName?: string;
    newHireAvatarUrl?: string;
  };
  variant: 'draft' | 'published';
}) {
  const displayName = pkg.newHireName ?? pkg.userId;
  return (
    <Link
      href={`/draft/${encodeURIComponent(pkg.userId)}`}
      style={{
        textDecoration: 'none',
        color: '#e2e8f0',
        display: 'block',
        padding: 16,
        background: 'rgba(30, 41, 59, 0.7)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderRadius: 12,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 0,
          }}
        >
          <Avatar name={displayName} src={pkg.newHireAvatarUrl} size={36} />
          <strong
            style={{
              fontSize: 15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </strong>
        </div>
        <span style={pillStyle(variant)}>
          {variant === 'draft' ? 'Draft' : 'Published'}
        </span>
      </div>
      <p
        style={{
          margin: '6px 0 0',
          color: '#94a3b8',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {pkg.welcomeNote
          ? pkg.welcomeNote.slice(0, 140)
          : 'No welcome note yet.'}
      </p>
      <p style={{margin: '6px 0 0', color: '#64748b', fontSize: 12}}>
        Updated {new Date(pkg.updatedAt).toLocaleString()}
      </p>
    </Link>
  );
}

function EmptyState({title, body}: {title: string; body: string}) {
  return (
    <div style={{maxWidth: 680, margin: '48px auto'}}>
      <section style={panelStyle}>
        <h1 style={headingStyle}>{title}</h1>
        <p style={bodyStyle}>{body}</p>
      </section>
    </div>
  );
}

/**
 * Explain WHY we couldn't build a session. The three failure modes:
 *
 *   - CF Access asserted an email, Slack resolved it happily, but we
 *     still landed here: can't actually happen — kept defensive.
 *   - CF Access asserted an email and Slack couldn't resolve it. Shows
 *     the email + Slack error code so the operator can fix the env
 *     (SLACK_BOT_TOKEN, users:read.email scope, workspace mismatch).
 *   - No CF Access at all. Either we're running locally without the
 *     Okta proxy, or Webflow Cloud is somehow not forwarding the JWT.
 *     `/api/whoami` tells you which.
 */
function describeNoSession(access: AccessDiagnostic): string {
  if (access.email) {
    const reason =
      access.slackLookup === 'user-not-found'
        ? `Slack returned "${access.slackLookupError ?? 'users_not_found'}" — check SLACK_BOT_TOKEN is set in Webflow Cloud env with the users:read.email scope, and that your Slack profile email matches ${access.email}.`
        : access.slackLookup === 'api-error'
          ? `Slack API call failed: ${access.slackLookupError ?? 'unknown error'}. Most common cause is a missing or stale SLACK_BOT_TOKEN in Webflow Cloud env.`
          : 'Slack lookup did not complete.';
    return `Cloudflare Access identified you as ${access.email}, but ${reason}`;
  }
  if (access.hasAccessHeader || access.hasAccessCookie) {
    return `Cloudflare Access forwarded a JWT but we couldn't decode an email out of it. Open /api/whoami to inspect the raw payload.`;
  }
  return `On Webflow Inside you're identified automatically via Okta SSO. If you're seeing this locally, set DEMO_MANAGER_SLACK_ID in .env. Hit /api/whoami to confirm whether Cloudflare Access headers are reaching the Worker.`;
}

const panelStyle = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.35)',
};

const eyebrowStyle = {
  margin: '0 0 8px',
  color: '#94a3b8',
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

const headingStyle = {
  margin: '0 0 12px',
  fontSize: '2.25rem',
  lineHeight: 1.1,
};

const bodyStyle = {
  margin: 0,
  color: '#cbd5e1',
  fontSize: '1rem',
  lineHeight: 1.6,
};

const sectionLabelStyle = {
  margin: '0 0 16px',
  color: '#94a3b8',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontSize: 12,
  fontWeight: 700,
};

function pillStyle(variant: 'draft' | 'published') {
  return {
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    background:
      variant === 'draft'
        ? 'rgba(251, 191, 36, 0.16)'
        : 'rgba(34, 197, 94, 0.16)',
    color: variant === 'draft' ? '#fcd34d' : '#86efac',
  };
}
