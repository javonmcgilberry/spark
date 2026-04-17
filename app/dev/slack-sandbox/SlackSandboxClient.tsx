'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {APP_NAME} from '../../../lib/branding';

interface FixtureEntry {
  id: string;
  label: string;
  endpoint: 'events' | 'interactivity';
  description: string;
  file: string;
}

interface SendResult {
  endpoint: 'events' | 'interactivity';
  status: number;
  durationMs: number;
  responseText: string;
  slackCalls: Array<{method: string; args: unknown; at: number}> | null;
  error?: string;
}

export default function SlackSandboxClient({
  fixtures,
}: {
  fixtures: FixtureEntry[];
}) {
  const [activeId, setActiveId] = useState(fixtures[0].id);
  const active = useMemo(
    () => fixtures.find((f) => f.id === activeId) ?? fixtures[0],
    [activeId, fixtures]
  );

  const [payload, setPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [fixtureLoadError, setFixtureLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFixtureLoadError(null);
    (async () => {
      try {
        const res = await fetch(active.file, {cache: 'no-store'});
        const text = await res.text();
        if (!cancelled) setPayload(text);
      } catch (error) {
        if (!cancelled)
          setFixtureLoadError(
            `Could not load ${active.file}: ${
              error instanceof Error ? error.message : 'unknown'
            }`
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active.file]);

  const send = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const endpointPath =
      active.endpoint === 'events'
        ? '/api/slack/events'
        : '/api/slack/interactivity';
    const started = performance.now();
    try {
      const body =
        active.endpoint === 'interactivity'
          ? `payload=${encodeURIComponent(payload)}`
          : payload;
      const res = await fetch(endpointPath, {
        method: 'POST',
        headers: {
          'content-type':
            active.endpoint === 'interactivity'
              ? 'application/x-www-form-urlencoded'
              : 'application/json',
          'x-dev-sandbox': '1',
        },
        body,
      });
      const responseText = await res.text();
      const slackCallsHeader = res.headers.get('x-spark-slack-calls');
      let slackCalls: SendResult['slackCalls'] = null;
      if (slackCallsHeader) {
        try {
          slackCalls = JSON.parse(slackCallsHeader) as SendResult['slackCalls'];
        } catch {
          slackCalls = null;
        }
      }
      setResult({
        endpoint: active.endpoint,
        status: res.status,
        durationMs: Math.round(performance.now() - started),
        responseText,
        slackCalls,
      });
    } catch (error) {
      setResult({
        endpoint: active.endpoint,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        responseText: '',
        slackCalls: null,
        error: error instanceof Error ? error.message : 'send failed',
      });
    } finally {
      setLoading(false);
    }
  }, [active, payload]);

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{margin: 0, fontSize: 20}}>Slack Sandbox</h1>
          <p style={{margin: '4px 0 0 0', color: '#64748b', fontSize: 13}}>
            Dev-only. Signed-request replay for every Slack event {APP_NAME}{' '}
            understands. Flip <code>ANTHROPIC_MOCK_MODE=1</code> and{' '}
            <code>SLACK_MOCK_MODE=1</code> in <code>.env</code> for free
            iteration.
          </p>
        </div>
        <div style={{fontSize: 12, color: '#94a3b8'}}>
          NODE_ENV: <code>{process.env.NODE_ENV ?? 'unknown'}</code>
        </div>
      </header>

      <div style={layoutStyle}>
        <aside style={sidebarStyle}>
          <h2 style={h2Style}>Scenarios</h2>
          <ul style={{listStyle: 'none', margin: 0, padding: 0}}>
            {fixtures.map((fx) => (
              <li key={fx.id}>
                <button
                  onClick={() => setActiveId(fx.id)}
                  style={{
                    ...scenarioButtonStyle,
                    background: activeId === fx.id ? '#eff6ff' : 'transparent',
                    borderColor: activeId === fx.id ? '#3b82f6' : 'transparent',
                  }}
                >
                  <div style={{fontWeight: 600}}>{fx.label}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                      marginTop: 2,
                    }}
                  >
                    {fx.endpoint === 'events' ? 'Events API' : 'Interactivity'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section style={editorStyle}>
          <h2 style={h2Style}>{active.label}</h2>
          <p style={{color: '#475569', fontSize: 13}}>{active.description}</p>
          <div style={{color: '#64748b', fontSize: 12, marginBottom: 8}}>
            Endpoint: <code>/api/slack/{active.endpoint}</code>
            {' · '}
            Payload is HMAC-signed with{' '}
            <code>process.env.SLACK_SIGNING_SECRET</code>. Tweak JSON freely.
          </div>
          {fixtureLoadError ? (
            <div style={errorStyle}>{fixtureLoadError}</div>
          ) : null}
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            style={textareaStyle}
            spellCheck={false}
          />
          <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
            <button
              onClick={send}
              disabled={loading || !payload}
              style={sendButtonStyle}
            >
              {loading ? 'Sending…' : 'Send signed request'}
            </button>
            <span style={{color: '#94a3b8', fontSize: 12}}>
              Signature verify is skipped when the <code>x-dev-sandbox: 1</code>{' '}
              header is present.
            </span>
          </div>
        </section>

        <section style={responseStyle}>
          <h2 style={h2Style}>Response</h2>
          {!result ? (
            <div style={{color: '#94a3b8', fontSize: 13}}>
              Hit Send to see the route response + any outbound Slack calls the
              handler made.
            </div>
          ) : (
            <>
              <div style={{fontSize: 13, marginBottom: 8}}>
                <strong>
                  {result.status === 0 ? 'error' : `HTTP ${result.status}`}
                </strong>
                {' — '}
                <span style={{color: '#64748b'}}>{result.durationMs}ms</span>
              </div>
              {result.error ? (
                <pre style={errorStyle}>{result.error}</pre>
              ) : null}
              <div style={sectionLabel}>Body</div>
              <pre style={resultBoxStyle}>
                {result.responseText || '(empty)'}
              </pre>
              {result.slackCalls && result.slackCalls.length > 0 ? (
                <>
                  <div style={sectionLabel}>
                    Outbound Slack calls ({result.slackCalls.length})
                  </div>
                  <pre style={resultBoxStyle}>
                    {JSON.stringify(result.slackCalls, null, 2)}
                  </pre>
                </>
              ) : result.slackCalls ? (
                <div style={{color: '#94a3b8', fontSize: 13}}>
                  Handler did not make any outbound Slack calls on this request.
                </div>
              ) : (
                <div style={{color: '#94a3b8', fontSize: 13}}>
                  (Outbound calls header absent — handler may not be running in
                  mock mode.)
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: 24,
  maxWidth: 1400,
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  paddingBottom: 16,
  borderBottom: '1px solid #e2e8f0',
  marginBottom: 20,
};

const layoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '260px 1fr 1fr',
  gap: 20,
  alignItems: 'stretch',
};

const sidebarStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 12,
  background: '#f8fafc',
  minHeight: 500,
};

const h2Style: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 14,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: '#475569',
};

const scenarioButtonStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  border: '1px solid transparent',
  borderRadius: 6,
  marginBottom: 4,
  cursor: 'pointer',
  fontSize: 13,
};

const editorStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 500,
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 300,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 12,
  padding: 12,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  marginBottom: 12,
  background: '#fff',
};

const sendButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};

const responseStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 16,
  minHeight: 500,
  overflow: 'auto',
};

const resultBoxStyle: React.CSSProperties = {
  background: '#0f172a',
  color: '#e2e8f0',
  padding: 12,
  borderRadius: 6,
  fontSize: 12,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
  marginBottom: 12,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: '#64748b',
  marginBottom: 6,
  marginTop: 6,
};

const errorStyle: React.CSSProperties = {
  background: '#fee2e2',
  color: '#991b1b',
  padding: 12,
  borderRadius: 6,
  fontSize: 12,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  marginBottom: 12,
};
