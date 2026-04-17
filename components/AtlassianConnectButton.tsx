'use client';

import {useCallback, useEffect, useState} from 'react';

/**
 * Connect Jira & Confluence via Atlassian OAuth 2.0 (3LO).
 *
 * Three visual states:
 *
 *   - idle (not connected)        → "Connect Jira & Confluence"
 *   - working (loading / polling) → subtle spinner label
 *   - connected (token on file)   → greyed-out pill with site name +
 *                                   a small "Disconnect" link
 *
 * Reads /api/auth/atlassian/status on mount (and after a connect round
 * trip completes — see `?atlassian_connected=...` handling in the
 * parent page) to pick which state to render.
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
}

type Status = StatusOk | StatusNotConnected | null;

export function AtlassianConnectButton() {
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
      // Leave previous status in place; UI shows "idle" at worst.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConnect = () => {
    // Full page redirect to Atlassian consent. When they come back
    // via /callback we'll land on `/?atlassian_connected=…`, and the
    // refresh() call on the next mount will flip this button green.
    window.location.href = '/api/auth/atlassian/start';
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/auth/atlassian/disconnect', {method: 'POST'});
      await refresh();
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = status?.connected === true;
  const reason = status && !status.connected ? status.reason : null;

  if (loading && status === null) {
    return <Pill tone="muted">Checking Atlassian…</Pill>;
  }

  if (connected) {
    const ok = status;
    return (
      <div style={wrap}>
        <Pill tone="ok" title={`Scope: ${ok.scope}`}>
          Jira & Confluence connected
          <span style={siteChipStyle}>{ok.site.name}</span>
        </Pill>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={disconnecting}
          style={disconnectButtonStyle}
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    );
  }

  // Not connected. Show the CTA. If the reason is "not-configured",
  // dim the button and explain.
  const unavailable = reason === 'oauth-not-configured';
  return (
    <div style={wrap}>
      <button
        type="button"
        onClick={handleConnect}
        disabled={unavailable || loading}
        style={unavailable ? disabledCtaStyle : ctaStyle}
        title={
          unavailable
            ? 'ATLASSIAN_OAUTH_CLIENT_ID is not set on this environment.'
            : 'Authorize Spark to read your Jira + Confluence data via Atlassian OAuth.'
        }
      >
        Connect Jira & Confluence
      </button>
      {unavailable && <span style={hintStyle}>OAuth app not configured</span>}
    </div>
  );
}

function Pill({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: 'ok' | 'muted';
  title?: string;
}) {
  const base = tone === 'ok' ? pillOk : pillMuted;
  return (
    <span style={base} title={title}>
      {children}
    </span>
  );
}

const wrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

const ctaStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #2684ff, #0052cc)',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.2,
  cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(0, 82, 204, 0.35)',
};

const disabledCtaStyle: React.CSSProperties = {
  ...ctaStyle,
  background: 'rgba(148, 163, 184, 0.22)',
  color: 'rgba(226, 232, 240, 0.68)',
  boxShadow: 'none',
  cursor: 'not-allowed',
};

const pillOk: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(34, 197, 94, 0.14)',
  color: '#4ade80',
  border: '1px solid rgba(34, 197, 94, 0.35)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0.2,
};

const pillMuted: React.CSSProperties = {
  ...pillOk,
  background: 'rgba(148, 163, 184, 0.14)',
  color: 'rgba(226, 232, 240, 0.7)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
};

const siteChipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '1px 8px',
  borderRadius: 999,
  background: 'rgba(15, 23, 42, 0.45)',
  color: 'rgba(226, 232, 240, 0.85)',
  fontWeight: 400,
};

const disconnectButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(226, 232, 240, 0.6)',
  fontSize: 12,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(226, 232, 240, 0.55)',
};
