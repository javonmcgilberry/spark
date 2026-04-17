'use client';

import {useState} from 'react';
import type {Finding} from '../lib/agents/critique';
import type {OnboardingPackage} from '../lib/types';

type SendStatus = 'idle' | 'hydrating' | 'publishing' | 'published' | 'error';

export function SendToSlackButton({
  pkg,
  criticalFindings,
  onPublished,
}: {
  pkg: OnboardingPackage;
  criticalFindings: Finding[];
  onPublished: (pkg: OnboardingPackage) => void;
}) {
  const [status, setStatus] = useState<SendStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const disabled =
    criticalFindings.length > 0 ||
    status === 'hydrating' ||
    status === 'publishing';

  async function publish(hydrateOnly = false) {
    setStatus(hydrateOnly ? 'hydrating' : 'publishing');
    setError(null);
    try {
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(pkg.userId)}/publish`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({hydrateOnly}),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `publish failed (${res.status})`);
      }
      const body = (await res.json()) as
        | {pkg: OnboardingPackage}
        | {pkg: OnboardingPackage; alreadyHydrated: boolean};
      setStatus(hydrateOnly ? 'idle' : 'published');
      onPublished(body.pkg);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }

  return (
    <div style={{display: 'grid', gap: 8}}>
      <div style={{display: 'flex', gap: 8}}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => publish(true)}
          style={{
            padding: '10px 14px',
            background: 'transparent',
            color: '#7dd3fc',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          {status === 'hydrating'
            ? 'Creating channel…'
            : 'Create draft channel in Slack'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => publish(false)}
          style={{
            padding: '10px 14px',
            background: disabled ? 'rgba(56, 189, 248, 0.4)' : '#38bdf8',
            color: '#0f172a',
            border: 'none',
            borderRadius: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
        >
          {status === 'publishing'
            ? 'Publishing…'
            : status === 'published'
              ? 'Published'
              : 'Publish to Slack'}
        </button>
      </div>
      {criticalFindings.length > 0 ? (
        <p style={{margin: 0, color: '#fca5a5', fontSize: 12}}>
          Resolve {criticalFindings.length} critical finding
          {criticalFindings.length === 1 ? '' : 's'} before publishing.
        </p>
      ) : null}
      {error ? (
        <p style={{margin: 0, color: '#fca5a5', fontSize: 12}}>{error}</p>
      ) : null}
    </div>
  );
}
