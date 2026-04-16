'use client';

import {useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';

export default function NewDraftPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slackId, setSlackId] = useState('');
  const [email, setEmail] = useState('');
  const [teamHint, setTeamHint] = useState('');
  const [startDate, setStartDate] = useState('');
  const [intent, setIntent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slackId && !email) {
      setError('Provide a Slack id or email for the new hire.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/spark-manager/api/drafts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          newHireSlackId: slackId || undefined,
          newHireEmail: email || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Create failed (${res.status})`);
      }
      const body = (await res.json()) as {pkg: {userId: string}};
      // Kick the generator off with the input we gathered — the draft
      // page will pick up streaming events.
      const generatorPayload = {
        v: 1,
        newHireName: name,
        slackUserIdIfKnown: slackId || undefined,
        email: email || undefined,
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
        <h1 style={headingStyle}>Tell Spark about the new hire</h1>
        <p style={bodyStyle}>
          Give the agent a sentence or two of context. It&apos;ll look up the
          team, pick candidates for buddy, draft the welcome, and tune the
          checklist. You&apos;ll review before anything reaches Slack.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{marginTop: 24, display: 'grid', gap: 16}}
        >
          <Field label="New hire name" required>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Maria Vega"
              style={inputStyle}
              required
            />
          </Field>
          <div
            style={{display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr'}}
          >
            <Field label="Slack user id" hint="Preferred. Starts with U…">
              <input
                type="text"
                value={slackId}
                onChange={(event) =>
                  setSlackId(event.target.value.trim().toUpperCase())
                }
                placeholder="U01ABCDEFG"
                style={inputStyle}
              />
            </Field>
            <Field label="Work email" hint="If no Slack id yet">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="maria@webflow.com"
                style={inputStyle}
              />
            </Field>
          </div>
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
            label="One sentence of intent"
            hint="Anything the agent should know that isn't in the org chart"
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
              disabled={submitting}
              style={{
                padding: '12px 18px',
                background: submitting ? '#0891b2' : '#38bdf8',
                color: '#0f172a',
                borderRadius: 8,
                fontWeight: 700,
                border: 'none',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? 'Creating draft…' : 'Create draft & run agent'}
            </button>
            <a
              href="/spark-manager"
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
        {required && <span style={{color: '#f87171'}}> *</span>}
      </span>
      {children}
      {hint && <span style={{fontSize: 12, color: '#64748b'}}>{hint}</span>}
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
