'use client';

import {useState} from 'react';
import type {ChecklistItem, ChecklistItemKind} from '../lib/types';

const KIND_LABELS: Record<ChecklistItemKind, string> = {
  task: 'Task',
  'live-training': 'Live training',
  workramp: 'WorkRamp',
  reading: 'Reading',
  recording: 'Recording',
};

export function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ChecklistItem>({
    label: '',
    kind: 'task',
    notes: '',
  });

  function addItem() {
    if (!draft.label.trim()) return;
    onChange([...items, {...draft, notes: draft.notes.trim()}]);
    setDraft({label: '', kind: 'task', notes: ''});
    setAdding(false);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<ChecklistItem>) {
    onChange(
      items.map((item, i) => (i === index ? {...item, ...patch} : item))
    );
  }

  return (
    <div style={{display: 'grid', gap: 12}}>
      {items.length === 0 && !adding ? (
        <p style={{margin: 0, color: '#64748b', fontSize: 14}}>
          No team-specific items yet. The generator usually adds 3–5; you can
          also add your own.
        </p>
      ) : null}
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          style={{
            display: 'grid',
            gap: 8,
            padding: 14,
            border: '1px solid rgba(148, 163, 184, 0.18)',
            borderRadius: 10,
            background: 'rgba(30, 41, 59, 0.5)',
          }}
        >
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input
              type="text"
              value={item.label}
              onChange={(event) =>
                updateItem(index, {label: event.target.value})
              }
              aria-label={`Checklist item ${index + 1}`}
              style={flexInput}
            />
            <select
              value={item.kind}
              onChange={(event) =>
                updateItem(index, {
                  kind: event.target.value as ChecklistItemKind,
                })
              }
              style={selectStyle}
              aria-label={`Item kind ${index + 1}`}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(index)}
              style={removeBtnStyle}
              aria-label={`Remove item ${index + 1}`}
            >
              Remove
            </button>
          </div>
          <input
            type="text"
            value={item.notes}
            onChange={(event) => updateItem(index, {notes: event.target.value})}
            placeholder="Notes or instructions"
            style={inputStyle}
            aria-label={`Notes for item ${index + 1}`}
          />
        </div>
      ))}

      {adding ? (
        <div
          style={{
            display: 'grid',
            gap: 8,
            padding: 14,
            border: '1px dashed rgba(56, 189, 248, 0.4)',
            borderRadius: 10,
          }}
        >
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input
              type="text"
              value={draft.label}
              onChange={(event) =>
                setDraft({...draft, label: event.target.value})
              }
              placeholder="New item label"
              style={flexInput}
              autoFocus
            />
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  kind: event.target.value as ChecklistItemKind,
                })
              }
              style={selectStyle}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={draft.notes}
            onChange={(event) =>
              setDraft({...draft, notes: event.target.value})
            }
            placeholder="Notes or instructions"
            style={inputStyle}
          />
          <div style={{display: 'flex', gap: 8}}>
            <button type="button" onClick={addItem} style={primaryBtnStyle}>
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft({label: '', kind: 'task', notes: ''});
              }}
              style={secondaryBtnStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={secondaryBtnStyle}
        >
          + Add checklist item
        </button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
};

const flexInput: React.CSSProperties = {...inputStyle, flex: 1};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: 'auto',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#38bdf8',
  color: '#0f172a',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: '#cbd5e1',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'left' as const,
};

const removeBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};
