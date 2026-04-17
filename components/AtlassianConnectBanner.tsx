'use client';

import {useCallback, useEffect, useState} from 'react';

/**
 * Pre-generation nudge for the manager to connect their Atlassian
 * account. Rendered above the "new onboarding plan" form so the
 * connection happens BEFORE Spark runs the Generator — that's when
 * per-viewer Jira + Confluence access actually changes the output.
 *
 * Three states, same data source (/api/auth/atlassian/status):
 *
 *   loading           — neutral skeleton pill, avoids layout thrash
 *   not-connected     — full value-prop banner with the connect CTA
 *   connected         — compact green confirmation + disconnect link
 *   unavailable       — quiet by default; when demo overrides are set,
 *                       render a muted banner that calls that out
 *
 * Does NOT block form submission — OAuth is strictly additive. A user
 * can skip the banner and still create a plan; the fallback Basic auth
 * path (or no Atlassian data at all) keeps working.
 */

interface StatusOk {
  connected: true;
  email: string;
  site: {cloudId: string; url: string; name: string};
  scope: string;
  expiresAt: number;
}

interface StatusNotConnected {
  connected: false;
  reason: string;
  demoMode?: boolean;
}

type Status = StatusOk | StatusNotConnected | null;

export function AtlassianConnectBanner() {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/atlassian/status', {
        cache: 'no-store',
      });
      if (res.ok) {
        setStatus((await res.json()) as Status);
      }
    } catch {
      // Leave last status in place. Worst case the banner renders the
      // "not-connected" state, which is a safe default.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && status === null) {
    return <SkeletonBanner />;
  }

  if (status?.connected === true) {
    return (
      <ConnectedBanner
        siteName={status.site.name}
        disconnecting={disconnecting}
        onDisconnect={async () => {
          setDisconnecting(true);
          try {
            await fetch('/api/auth/atlassian/disconnect', {method: 'POST'});
            await refresh();
          } finally {
            setDisconnecting(false);
          }
        }}
      />
    );
  }

  const reason = status && !status.connected ? status.reason : null;
  if (reason === 'oauth-not-configured' || reason === 'storage-unavailable') {
    if (status?.demoMode) {
      return <DemoModeBanner />;
    }
    // When OAuth can't run (missing ATLASSIAN_OAUTH_CLIENT_ID or no D1
    // token store), the Basic-auth fallback via JIRA_API_TOKEN /
    // CONFLUENCE_API_TOKEN still produces the plan. Render nothing
    // rather than surface a CTA the viewer can't act on.
    return null;
  }

  return <ConnectCta loading={loading} demoMode={Boolean(status?.demoMode)} />;
}

function ConnectCta({
  loading,
  demoMode,
}: {
  loading: boolean;
  demoMode?: boolean;
}) {
  return (
    <aside style={ctaBannerStyle} role="region" aria-label="Atlassian connect">
      <div style={ctaIconWrap}>
        <AtlassianGlyph />
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <p style={ctaTitleStyle}>Connect Atlassian for richer insights</p>
        <p style={ctaBodyStyle}>
          Spark combines <strong>Jira</strong>, <strong>Confluence</strong>, and{' '}
          <strong>GitHub</strong> to pull the hire&apos;s team tickets, team +
          pillar home pages, people user-guides, and related PRs into the plan.
          Jira + Confluence authorize as <em>you</em>, respecting your
          permissions.
        </p>
        {demoMode ? (
          <p style={finePrintStyle}>Overrides detected. Demo mode.</p>
        ) : null}
      </div>
      <a
        href="/api/auth/atlassian/start"
        aria-disabled={loading}
        style={{
          ...ctaButtonStyle,
          pointerEvents: loading ? 'none' : 'auto',
          opacity: loading ? 0.7 : 1,
        }}
      >
        Connect Jira &amp; Confluence
      </a>
    </aside>
  );
}

function DemoModeBanner() {
  return (
    <aside style={demoBannerStyle} role="note" aria-label="Atlassian demo mode">
      <div style={ctaIconWrap}>
        <AtlassianGlyph />
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <p style={ctaTitleStyle}>Atlassian demo mode</p>
        <p style={ctaBodyStyle}>
          This environment is using configured Jira or viewer-email overrides
          instead of the Atlassian connect flow. Plans still include the
          available Jira and Confluence signal.
        </p>
        <p style={finePrintStyle}>Overrides detected. Demo mode.</p>
      </div>
    </aside>
  );
}

function ConnectedBanner({
  siteName,
  disconnecting,
  onDisconnect,
}: {
  siteName: string;
  disconnecting: boolean;
  onDisconnect: () => Promise<void>;
}) {
  return (
    <aside
      style={connectedBannerStyle}
      role="region"
      aria-label="Atlassian connected"
    >
      <span style={checkIconStyle} aria-hidden>
        ✓
      </span>
      <span style={connectedTextStyle}>
        Atlassian connected
        <span style={siteChipStyle}>{siteName}</span>
        <span style={connectedDetailStyle}>
          — Jira + Confluence signal enabled
        </span>
      </span>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnecting}
        style={disconnectLinkStyle}
      >
        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
      </button>
    </aside>
  );
}

function NotConfiguredNote() {
  return (
    <aside style={notConfiguredStyle}>
      Atlassian OAuth isn&apos;t configured on this environment. Plans will
      still generate using any configured Jira/Confluence API token fallback, or
      skip those sources entirely.
    </aside>
  );
}

function SkeletonBanner() {
  return <aside style={skeletonStyle} aria-hidden />;
}

function AtlassianGlyph() {
  // Inline stacked-triangles glyph so there's no extra asset to ship
  // and the icon scales with the banner.
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9.2 19.2l-5.8 7.8c-.4.5 0 1.3.6 1.3h9.2c.3 0 .5-.1.6-.4 2.6-5.4.6-13.8-4.6-8.7z"
        fill="#2684FF"
      />
      <path
        d="M15.4 9.8c-4.6 6.4 1.6 12.1 5 18.2.1.2.4.3.6.3h8.7c.6 0 1-.8.6-1.3L16.6 9.8c-.3-.4-.9-.4-1.2 0z"
        fill="#0052CC"
      />
    </svg>
  );
}

const ctaBannerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  padding: '14px 18px',
  marginBottom: 20,
  borderRadius: 14,
  border: '1px solid rgba(38, 132, 255, 0.28)',
  background:
    'linear-gradient(135deg, rgba(38, 132, 255, 0.12), rgba(0, 82, 204, 0.08))',
  color: '#e2e8f0',
  flexWrap: 'wrap',
};

const ctaIconWrap: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(38, 132, 255, 0.15)',
  flexShrink: 0,
};

const ctaTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.1,
};

const ctaBodyStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12.5,
  lineHeight: 1.55,
  color: 'rgba(226, 232, 240, 0.78)',
};

const finePrintStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 11.5,
  lineHeight: 1.45,
  color: 'rgba(226, 232, 240, 0.56)',
};

const ctaButtonStyle: React.CSSProperties = {
  textDecoration: 'none',
  padding: '9px 16px',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #2684ff, #0052cc)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.2,
  boxShadow: '0 6px 16px rgba(0, 82, 204, 0.35)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const connectedBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  marginBottom: 20,
  borderRadius: 14,
  border: '1px solid rgba(34, 197, 94, 0.32)',
  background: 'rgba(34, 197, 94, 0.1)',
  color: '#bbf7d0',
  fontSize: 13,
  flexWrap: 'wrap',
};

const demoBannerStyle: React.CSSProperties = {
  ...ctaBannerStyle,
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background:
    'linear-gradient(135deg, rgba(148, 163, 184, 0.1), rgba(30, 41, 59, 0.14))',
};

const checkIconStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(34, 197, 94, 0.32)',
  color: '#0f172a',
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
};

const connectedTextStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  flexWrap: 'wrap',
};

const siteChipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(15, 23, 42, 0.4)',
  color: 'rgba(226, 232, 240, 0.88)',
  fontWeight: 500,
};

const connectedDetailStyle: React.CSSProperties = {
  color: 'rgba(226, 232, 240, 0.65)',
  fontSize: 12,
};

const disconnectLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(226, 232, 240, 0.55)',
  fontSize: 12,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
};

const notConfiguredStyle: React.CSSProperties = {
  padding: '10px 14px',
  marginBottom: 20,
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.22)',
  background: 'rgba(15, 23, 42, 0.62)',
  color: 'rgba(226, 232, 240, 0.72)',
  fontSize: 12.5,
  lineHeight: 1.55,
};

const skeletonStyle: React.CSSProperties = {
  height: 60,
  marginBottom: 20,
  borderRadius: 14,
  background: 'rgba(148, 163, 184, 0.08)',
};
