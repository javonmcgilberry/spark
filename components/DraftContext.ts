import {createContext, use} from 'react';
import type {DraftFieldPatch, OnboardingPackage} from '../lib/types';
import type {GeneratorEvent} from '../lib/agents/generator';
import type {Finding} from '../lib/agents/critique';
import type {SaveStatus} from '../lib/useDraft';

export interface DraftState {
  pkg: OnboardingPackage;
  saveStatus: SaveStatus;
  saveError: string | null;
  agentEvents: GeneratorEvent[];
  generating: boolean;
  generatorReady: boolean;
  findings: Finding[];
  critiqueStatus: 'idle' | 'running' | 'error';
  critiqueError: string | null;
}

export interface DraftActions {
  patch: (patch: DraftFieldPatch, opts?: {flush?: boolean}) => void;
  reload: () => Promise<void>;
  runGenerator: () => Promise<void>;
  runCritique: () => Promise<void>;
  applyFix: (patch: DraftFieldPatch) => void;
}

export interface DraftMeta {
  newHireId: string;
  managerSlackId: string;
}

export interface DraftContextValue {
  state: DraftState;
  actions: DraftActions;
  meta: DraftMeta;
}

export const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraftContext(): DraftContextValue {
  const ctx = use(DraftContext);
  if (!ctx) throw new Error('useDraftContext must be inside <DraftProvider>');
  return ctx;
}
