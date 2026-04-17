'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {DraftFieldPatch, OnboardingPackage} from '../lib/types';
import type {Finding} from '../lib/agents/critique';
import type {GeneratorEvent, GeneratorInput} from '../lib/agents/generator';
import {useDraft} from '../lib/useDraft';
import {
  DraftContext,
  type DraftActions,
  type DraftContextValue,
  type DraftMeta,
  type DraftState,
} from './DraftContext';

const GENERATOR_INPUT_VERSION = 1;

type GeneratorInputStored = GeneratorInput & {v: number};

export function DraftProvider({
  initialPackage,
  newHireId,
  managerSlackId,
  children,
}: {
  initialPackage: OnboardingPackage;
  newHireId: string;
  managerSlackId: string;
  children: ReactNode;
}) {
  const draft = useDraft(initialPackage);
  const [agentEvents, setAgentEvents] = useState<GeneratorEvent[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatorInput, setGeneratorInput] = useState<GeneratorInput | null>(
    null
  );
  const [findings, setFindings] = useState<Finding[]>([]);
  const [critiqueStatus, setCritiqueStatus] = useState<
    'idle' | 'running' | 'error'
  >('idle');
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const startedForKey = useRef<string | null>(null);

  useEffect(() => {
    const key = `spark:generator-input:${newHireId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<GeneratorInputStored>;
      if (parsed.v !== GENERATOR_INPUT_VERSION) return;
      const {v: _v, ...rest} = parsed;
      if (rest.newHireName) {
        setGeneratorInput(rest as GeneratorInput);
      }
    } catch {
      // ignore stale/corrupt payload
    }
  }, [newHireId]);

  const runGenerator = useCallback(async () => {
    if (!generatorInput) return;
    setGenerating(true);
    setAgentEvents([]);
    try {
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(newHireId)}/generate`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(generatorInput),
        }
      );
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `generate failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const parsed = JSON.parse(
              line.replace(/^data:\s*/, '')
            ) as GeneratorEvent;
            setAgentEvents((prev) => [...prev, parsed]);
            if (
              parsed.type === 'draft_ready' ||
              parsed.type === 'draft_persisted'
            ) {
              await draft.reload();
            }
          } catch {
            // ignore parse errors on partial frames
          }
        }
      }
    } catch (error) {
      setAgentEvents((prev) => [
        ...prev,
        {
          type: 'error',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      ]);
    } finally {
      setGenerating(false);
      sessionStorage.removeItem(`spark:generator-input:${newHireId}`);
      setGeneratorInput(null);
    }
  }, [generatorInput, newHireId, draft]);

  useEffect(() => {
    if (!generatorInput) return;
    if (startedForKey.current === newHireId) return;
    startedForKey.current = newHireId;
    void runGenerator();
  }, [generatorInput, newHireId, runGenerator]);

  // Refresh insights whenever the set of pending people changes. Keying
  // off the pending slack IDs (not pkg.updatedAt) prevents the loop
  // where refresh-insights bumps updatedAt and re-triggers itself, and
  // it also means a newly-assigned buddy fires exactly one refresh
  // covering just the roster that actually needs blurbs.
  const insightsRefreshedFor = useRef<string>('');
  useEffect(() => {
    const pending = draft.pkg.sections.peopleToMeet.people
      .filter((p) => p.insightsStatus === 'pending' && p.slackUserId)
      .map((p) => p.slackUserId!)
      .sort();
    if (pending.length === 0) return;
    const refreshKey = `${newHireId}:${pending.join(',')}`;
    if (insightsRefreshedFor.current === refreshKey) return;
    insightsRefreshedFor.current = refreshKey;
    void (async () => {
      try {
        const res = await fetch(
          `/api/drafts/${encodeURIComponent(newHireId)}/refresh-insights`,
          {method: 'POST'}
        );
        if (!res.ok) return;
        const body = (await res.json()) as {pkg: OnboardingPackage};
        draft.replace(body.pkg);
      } catch {
        // Insights are best-effort — the template discussionPoints still render.
      }
    })();
  }, [newHireId, draft]);

  const runCritique = useCallback(async () => {
    setCritiqueStatus('running');
    setCritiqueError(null);
    try {
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(newHireId)}/critique`,
        {method: 'POST'}
      );
      if (!res.ok) throw new Error(`critique failed (${res.status})`);
      const body = (await res.json()) as {findings: Finding[]};
      setFindings(body.findings);
      setCritiqueStatus('idle');
    } catch (error) {
      setCritiqueStatus('error');
      setCritiqueError(
        error instanceof Error ? error.message : 'critique failed'
      );
    }
  }, [newHireId]);

  const applyFix = useCallback(
    (fix: DraftFieldPatch) => {
      draft.patch(fix, {flush: true});
    },
    [draft]
  );

  const state: DraftState = {
    pkg: draft.pkg,
    saveStatus: draft.status,
    saveError: draft.lastError,
    agentEvents,
    generating,
    generatorReady: generatorInput !== null,
    findings,
    critiqueStatus,
    critiqueError,
  };

  const actions: DraftActions = {
    patch: draft.patch,
    reload: draft.reload,
    runGenerator,
    runCritique,
    applyFix,
  };

  const meta: DraftMeta = useMemo(
    () => ({newHireId, managerSlackId}),
    [newHireId, managerSlackId]
  );

  const value: DraftContextValue = {state, actions, meta};

  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
}
