import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata: Metadata = {
  title: 'Spark · Manager dashboard',
  description:
    'Generate, review, and send onboarding plans to Slack with an AI teammate.',
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
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
            <strong style={{fontSize: 16, letterSpacing: 0.3}}>Spark</strong>
            <span style={{color: '#94a3b8', fontSize: 13}}>
              Manager dashboard
            </span>
          </div>
          <a
            href="/spark-manager/new"
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
