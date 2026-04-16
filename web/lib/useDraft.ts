'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {DraftFieldPatch, OnboardingPackage} from './types';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface UseDraftResult {
  pkg: OnboardingPackage;
  status: SaveStatus;
  lastError: string | null;
  patch: (patch: DraftFieldPatch, options?: {flush?: boolean}) => void;
  reload: () => Promise<void>;
}

/**
 * Manages the current draft in state, debounces PATCH requests (default
 * 800ms), and exposes a save indicator. Optimistic updates apply locally
 * before the server responds; on error the status flips to 'error' and
 * the UI should show a retry affordance.
 */
export function useDraft(
  initialPackage: OnboardingPackage,
  options: {debounceMs?: number} = {}
): UseDraftResult {
  const debounceMs = options.debounceMs ?? 800;
  const [pkg, setPkg] = useState(initialPackage);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const pending = useRef<DraftFieldPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      await inFlight.current;
    }
    const batch = pending.current;
    pending.current = {};
    if (Object.keys(batch).length === 0) {
      return;
    }
    setStatus('saving');
    const run = (async () => {
      try {
        const res = await fetch(
          `/spark-manager/api/drafts/${encodeURIComponent(pkg.userId)}`,
          {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(batch),
          }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `patch failed (${res.status})`);
        }
        const body = (await res.json()) as {pkg: OnboardingPackage};
        setPkg(body.pkg);
        setStatus('saved');
        setLastError(null);
      } catch (error) {
        setStatus('error');
        setLastError(error instanceof Error ? error.message : 'unknown error');
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    await run;
  }, [pkg.userId]);

  const patch = useCallback(
    (next: DraftFieldPatch, opts?: {flush?: boolean}) => {
      setStatus('dirty');
      // Optimistic: merge the visible fields locally
      setPkg((current) => applyLocal(current, next));
      pending.current = mergePatch(pending.current, next);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      if (opts?.flush) {
        void flush();
        return;
      }
      timer.current = setTimeout(() => {
        void flush();
      }, debounceMs);
    },
    [debounceMs, flush]
  );

  const reload = useCallback(async () => {
    try {
      const res = await fetch(
        `/spark-manager/api/drafts/${encodeURIComponent(pkg.userId)}`
      );
      if (!res.ok) throw new Error(`reload failed (${res.status})`);
      const body = (await res.json()) as {pkg: OnboardingPackage};
      setPkg(body.pkg);
      setStatus('idle');
      setLastError(null);
    } catch (error) {
      setStatus('error');
      setLastError(error instanceof Error ? error.message : 'unknown error');
    }
  }, [pkg.userId]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return {pkg, status, lastError, patch, reload};
}

function mergePatch(a: DraftFieldPatch, b: DraftFieldPatch): DraftFieldPatch {
  return {
    ...a,
    ...b,
    // arrays replace wholesale — that matches the bot's applyFieldPatch
    ...(b.stakeholderUserIds ? {stakeholderUserIds: b.stakeholderUserIds} : {}),
    ...(b.customChecklistItems
      ? {customChecklistItems: b.customChecklistItems}
      : {}),
  };
}

function applyLocal(
  pkg: OnboardingPackage,
  patch: DraftFieldPatch
): OnboardingPackage {
  const next: OnboardingPackage = {
    ...pkg,
    sections: {...pkg.sections, welcome: {...pkg.sections.welcome}},
  };
  if (patch.welcomeNote !== undefined) {
    next.welcomeNote = patch.welcomeNote ?? undefined;
    next.sections.welcome.personalizedNote = patch.welcomeNote ?? undefined;
  }
  if (patch.buddyUserId !== undefined) {
    next.buddyUserId = patch.buddyUserId ?? undefined;
  }
  if (patch.customChecklistItems !== undefined) {
    next.customChecklistItems = [...patch.customChecklistItems];
  }
  return next;
}
