'use client';

import {useEffect, useState} from 'react';

export function WelcomeNoteEditor({
  intro,
  note,
  onIntroChange,
  onNoteChange,
}: {
  intro: string | undefined;
  note: string | undefined;
  onIntroChange: (next: string) => void;
  onNoteChange: (next: string) => void;
}) {
  const [localIntro, setLocalIntro] = useState(intro ?? '');
  const [localNote, setLocalNote] = useState(note ?? '');

  useEffect(() => {
    setLocalIntro(intro ?? '');
  }, [intro]);
  useEffect(() => {
    setLocalNote(note ?? '');
  }, [note]);

  return (
    <div style={{display: 'grid', gap: 16}}>
      <div style={{display: 'grid', gap: 6}}>
        <div style={labelRow}>
          <span style={labelStyle}>From your manager</span>
          <span style={hintStyle}>
            Warm, personal, as long as it needs to be
          </span>
        </div>
        <textarea
          value={localNote}
          onChange={(event) => {
            setLocalNote(event.target.value);
            onNoteChange(event.target.value);
          }}
          placeholder="A paragraph from you — what the team works on, who their buddy is, why you're excited they joined."
          rows={6}
          style={textareaStyle}
          aria-label="Welcome note from the manager"
        />
      </div>

      <div style={{display: 'grid', gap: 6}}>
        <div style={labelRow}>
          <span style={labelStyle}>From Spark</span>
          <span style={hintStyle}>Short, friendly opener — 1–2 sentences</span>
        </div>
        <textarea
          value={localIntro}
          onChange={(event) => {
            setLocalIntro(event.target.value);
            onIntroChange(event.target.value);
          }}
          placeholder="Welcome, [first name]! I've pulled together a plan for your first few weeks."
          rows={2}
          style={{
            ...textareaStyle,
            fontStyle: 'italic',
            color: '#cbd5e1',
          }}
          aria-label="Welcome note from Spark"
        />
      </div>
    </div>
  );
}

const labelRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
};

const textareaStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(30, 41, 59, 0.7)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.55,
  resize: 'vertical',
  width: '100%',
};
