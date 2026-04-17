import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {APP_NAME} from '../lib/branding';

export const metadata: Metadata = {
  title: `${APP_NAME} — Onboarding assistant`,
  description: `Plan onboarding drafts with ${APP_NAME}, your AI co-pilot. Generate, review, and send to Slack.`,
};

const GLOBAL_STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  @keyframes spark-pulse {
    0% { opacity: 1; }
    50% { opacity: 0.35; }
    100% { opacity: 1; }
  }
  .spark-pulse { animation: spark-pulse 1.4s ease-in-out infinite; }
`;

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{__html: GLOBAL_STYLE}} />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          background: '#0f172a',
          color: '#e2e8f0',
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            padding: '20px 32px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 999,
                background: '#38bdf8',
                boxShadow: '0 0 12px rgba(56, 189, 248, 0.7)',
              }}
            />
            <strong style={{fontSize: 16, letterSpacing: 0.3}}>
              {APP_NAME}
            </strong>
            <span style={{color: '#94a3b8', fontSize: 13}}>
              Onboarding assistant
            </span>
          </div>
          <a
            href="/new"
            style={{
              color: '#38bdf8',
              textDecoration: 'none',
              fontSize: 14,
              padding: '8px 14px',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 8,
            }}
          >
            Create onboarding plan
          </a>
        </header>
        <main style={{padding: '32px'}}>{children}</main>
      </body>
    </html>
  );
}
