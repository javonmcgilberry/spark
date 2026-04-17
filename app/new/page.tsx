'use client';

import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {SlackUserPicker} from '../../components/SlackUserPicker';
import type {SlackUserHit} from '../../lib/services/slackUserDirectory';
import {APP_NAME} from '../../lib/branding';

export default function NewDraftPage() {
  const router = useRouter();
  const [hire, setHire] = useState<SlackUserHit | null>(null);
  const [teamHint, setTeamHint] = useState('');
  const [startDate, setStartDate] = useState('');
  const [intent, setIntent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hire) {
      setError('Pick a new hire from the Slack workspace.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          newHireSlackId: hire.slackUserId,
          // Slack may redact email for some users — slackUserId alone is fine.
          newHireEmail: hire.email,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Create failed (${res.status})`);
      }
      const body = (await res.json()) as {pkg: {userId: string}};
      const generatorPayload = {
        v: 1,
        newHireName: hire.name,
        slackUserIdIfKnown: hire.slackUserId,
        email: hire.email,
        teamHint: teamHint || undefined,
        startDate: startDate || undefined,
        intent: intent || undefined,
      };
      sessionStorage.setItem(
        `spark:generator-input:${body.pkg.userId}`,
        JSON.stringify(generatorPayload)
      );
      router.push(`/draft/${encodeURIComponent(body.pkg.userId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{maxWidth: 640, margin: '0 auto'}}>
      <section style={panelStyle}>
        <p style={eyebrowStyle}>New onboarding plan</p>
        <h1 style={headingStyle}>Tell {APP_NAME} about the new hire</h1>
        <p style={bodyStyle}>
          Search the Slack workspace to pick the new hire. {APP_NAME} uses their
          profile to look up the team, pick candidates for buddy, draft the
          welcome, and tune the checklist. You&apos;ll review before anything
          reaches Slack.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{marginTop: 24, display: 'grid', gap: 16}}
        >
          <Field
            label="New hire"
            hint={hire ? undefined : 'Type a name, display name, or email'}
            required
          >
            <SlackUserPicker value={hire} onChange={setHire} autoFocus />
          </Field>

          <Field label="Start date" hint="For the week-by-week plan">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field
            label="Team hint"
            hint="Optional — helps if DX warehouse lookup misses"
          >
            <input
              type="text"
              value={teamHint}
              onChange={(event) => setTeamHint(event.target.value)}
              placeholder="Commerce Sprint, backend"
              style={inputStyle}
            />
          </Field>
          <Field
            label={`Context for ${APP_NAME}`}
            hint={`Anything ${APP_NAME} should know that isn't in Slack or the org chart — what they care about, recent life context, specific worries. Optional.`}
          >
            <textarea
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Maria cares about reliability and is joining after parental leave."
              style={{...inputStyle, minHeight: 96, resize: 'vertical'}}
              rows={3}
            />
          </Field>

          {error ? (
            <p style={{color: '#f87171', fontSize: 13, margin: 0}}>{error}</p>
          ) : null}

          <div style={{display: 'flex', gap: 12}}>
            <button
              type="submit"
              disabled={submitting || !hire}
              style={{
                padding: '12px 18px',
                background: submitting || !hire ? '#0891b2' : '#38bdf8',
                color: '#0f172a',
                borderRadius: 8,
                fontWeight: 700,
                border: 'none',
                cursor: submitting || !hire ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating draft…' : 'Create draft & run agent'}
            </button>
            <a
              href="/"
              style={{
                padding: '12px 18px',
                color: '#cbd5e1',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Cancel
            </a>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{display: 'grid', gap: 6}}>
      <span style={{fontSize: 13, color: '#e2e8f0'}}>
        {label}
        {required ? <span style={{color: '#f87171'}}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span style={{fontSize: 12, color: '#64748b'}}>{hint}</span>
      ) : null}
    </label>
  );
}

const panelStyle = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: 16,
  padding: 28,
};

const eyebrowStyle = {
  margin: '0 0 8px',
  color: '#38bdf8',
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

const headingStyle = {
  margin: '0 0 12px',
  fontSize: '1.75rem',
  lineHeight: 1.2,
};

const bodyStyle = {
  margin: 0,
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(30, 41, 59, 0.7)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 14,
};
