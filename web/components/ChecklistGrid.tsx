'use client';

import {useState} from 'react';
import type {CSSProperties} from 'react';
import type {ChecklistItem, OnboardingPackage} from '../lib/types';

export function ChecklistGrid({
  pkg,
  onColumnChange,
}: {
  pkg: OnboardingPackage;
  onColumnChange: (sectionId: string, items: ChecklistItem[]) => void;
}) {
  const catalogSections = pkg.sections.onboardingChecklist.sections;
  return (
    <div style={gridStyle}>
      {catalogSections.map((section) => {
        const items = pkg.checklistRows?.[section.id] ?? section.items;
        return (
          <Column
            key={section.id}
            sectionId={section.id}
            title={section.title}
            goal={section.goal}
            items={items}
            onChange={(next) => onColumnChange(section.id, next)}
          />
        );
      })}
    </div>
  );
}

function Column({
  sectionId,
  title,
  goal,
  items,
  onChange,
}: {
  sectionId: string;
  title: string;
  goal: string;
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  const updateItem = (index: number, patch: Partial<ChecklistItem>) =>
    onChange(items.map((it, i) => (i === index ? {...it, ...patch} : it)));
  const removeItem = (index: number) =>
    onChange(items.filter((_, i) => i !== index));
  const appendItem = (item: ChecklistItem) => onChange([...items, item]);

  return (
    <div style={columnStyle}>
      <div style={columnHeaderStyle}>
        <strong style={{fontSize: 13, color: '#e2e8f0'}}>{title}</strong>
        <span style={{fontSize: 11, color: '#64748b', lineHeight: 1.4}}>
          {goal}
        </span>
      </div>
      <div style={{display: 'grid', gap: 8}}>
        {items.map((item, index) => (
          <ItemRow
            key={`${sectionId}-${index}`}
            item={item}
            onChange={(patch) => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
          />
        ))}
        <AddItemControl onAdd={appendItem} sectionId={sectionId} />
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: ChecklistItem;
  onChange: (patch: Partial<ChecklistItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div style={itemStyle}>
      <div style={{display: 'flex', gap: 6}}>
        <input
          type="text"
          value={item.label}
          onChange={(event) => onChange({label: event.target.value})}
          aria-label="Checklist item"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          style={removeBtn}
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function AddItemControl({
  onAdd,
  sectionId,
}: {
  onAdd: (item: ChecklistItem) => void;
  sectionId: string;
}) {
  const [label, setLabel] = useState('');
  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({
      label: trimmed,
      kind: 'task',
      notes: '',
      sectionId,
    });
    setLabel('');
  };
  return (
    <div style={{display: 'flex', gap: 6}}>
      <input
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="+ Add item"
        style={{...inputStyle, fontStyle: 'italic'}}
      />
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
};

const columnStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(30, 41, 59, 0.5)',
  minWidth: 0,
};

const columnHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
};

const itemStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#e2e8f0',
  fontFamily: 'inherit',
  fontSize: 12,
  width: '100%',
};

const removeBtn: CSSProperties = {
  padding: '2px 8px',
  background: 'transparent',
  color: '#fca5a5',
  border: '1px solid rgba(248, 113, 113, 0.3)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
};
