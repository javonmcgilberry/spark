'use client';

import {useState} from 'react';
import type {CSSProperties} from 'react';
import type {
  ChecklistItem,
  ChecklistItemKind,
  OnboardingPackage,
} from '../lib/types';

const KIND_LABELS: Record<ChecklistItemKind, string> = {
  task: 'Task',
  'live-training': 'Live training',
  workramp: 'WorkRamp',
  reading: 'Reading',
  recording: 'Recording',
};

const KIND_OPTIONS = Object.keys(KIND_LABELS) as ChecklistItemKind[];

export function ChecklistTabs({
  pkg,
  onColumnChange,
}: {
  pkg: OnboardingPackage;
  onColumnChange: (sectionId: string, items: ChecklistItem[]) => void;
}) {
  const catalogSections = pkg.sections.onboardingChecklist.sections;
  const [activeId, setActiveId] = useState(() => catalogSections[0]?.id ?? '');

  const activeSection =
    catalogSections.find((s) => s.id === activeId) ?? catalogSections[0];
  if (!activeSection) {
    return (
      <p style={{margin: 0, color: '#64748b', fontSize: 13}}>
        No checklist sections available.
      </p>
    );
  }

  const items = pkg.checklistRows?.[activeSection.id] ?? activeSection.items;
  const emit = (next: ChecklistItem[]) =>
    onColumnChange(activeSection.id, next);

  const updateItem = (index: number, patch: Partial<ChecklistItem>) =>
    emit(items.map((it, i) => (i === index ? {...it, ...patch} : it)));
  const removeItem = (index: number) =>
    emit(items.filter((_, i) => i !== index));
  const addItem = () =>
    emit([
      ...items,
      {
        label: '',
        kind: 'task',
        notes: '',
        sectionId: activeSection.id,
      },
    ]);

  return (
    <div style={{display: 'grid', gap: 14}}>
      <div style={tabStripStyle} role="tablist">
        {catalogSections.map((section) => {
          const isActive = section.id === activeSection.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(section.id)}
              style={isActive ? activeTabStyle : tabStyle}
            >
              {shortTabLabel(section.title)}
            </button>
          );
        })}
      </div>

      <p style={goalStyle}>{activeSection.goal}</p>

      <div style={{display: 'grid', gap: 10}}>
        {items.length === 0 ? (
          <p style={{margin: 0, color: '#64748b', fontSize: 13}}>
            No items yet. Add one below.
          </p>
        ) : null}
        {items.map((item, index) => (
          <ChecklistItemRow
            key={`${activeSection.id}-${index}`}
            item={item}
            onChange={(patch) => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
          />
        ))}
        <button type="button" onClick={addItem} style={addButtonStyle}>
          + Add item
        </button>
      </div>
    </div>
  );
}

function ChecklistItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: ChecklistItem;
  onChange: (patch: Partial<ChecklistItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={rowStyle}>
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <input
          type="text"
          value={item.label}
          onChange={(event) => onChange({label: event.target.value})}
          placeholder="Checklist item"
          aria-label="Checklist item"
          style={labelInputStyle}
        />
        <select
          value={item.kind}
          onChange={(event) =>
            onChange({kind: event.target.value as ChecklistItemKind})
          }
          aria-label="Item kind"
          style={selectStyle}
        >
          {KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          style={removeBtnStyle}
        >
          Remove
        </button>
      </div>
      <input
        type="url"
        value={item.resourceUrl ?? ''}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange({resourceUrl: next || undefined});
        }}
        placeholder="Link (https://…) — optional"
        aria-label="Item link"
        style={linkInputStyle}
      />
      <textarea
        value={item.notes}
        onChange={(event) => onChange({notes: event.target.value})}
        placeholder="Notes or context a manager would want the new hire to know."
        rows={2}
        aria-label="Item notes"
        style={notesStyle}
      />
    </div>
  );
}

function shortTabLabel(title: string): string {
  const [head] = title.split(':');
  return head?.trim() || title;
}

const tabStripStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 4,
  borderRadius: 10,
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
};

const tabStyle: CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  background: 'transparent',
  color: '#94a3b8',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.2,
};

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  background: 'rgba(56, 189, 248, 0.14)',
  color: '#7dd3fc',
};

const goalStyle: CSSProperties = {
  margin: 0,
  color: '#94a3b8',
  fontSize: 13,
  lineHeight: 1.5,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: 12,
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(30, 41, 59, 0.5)',
};

const labelInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 13,
};

const selectStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 12,
};

const notesStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#cbd5e1',
  fontFamily: 'inherit',
  fontSize: 12,
  lineHeight: 1.5,
  resize: 'vertical',
};

const linkInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#7dd3fc',
  fontFamily: 'inherit',
  fontSize: 12,
};

const removeBtnStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const addButtonStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'transparent',
  color: '#7dd3fc',
  border: '1px dashed rgba(56, 189, 248, 0.4)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'left' as const,
};
