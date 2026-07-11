/**
 * Sprint 11A-6: Backend-first composition state hook.
 *
 * Backend API is the primary data source.
 * productionStateStore (localStorage) is the fallback cache layer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCompositionState, putCompositionState } from '../api/compositionApi';
import {
  getCompositionOrder as getCachedOrder,
  setCompositionOrder as setCachedOrder,
  getTimelineDurations as getCachedDurations,
  setTimelineDurations as setCachedDurations,
} from '../lib/productionStateStore';

interface CompositionStateData {
  order: string[];
  durations: Record<string, number>;
  version: number;
  loading: boolean;
  error: string | null;
  source: 'api' | 'cache';
}

interface UseCompositionStateReturn extends CompositionStateData {
  updateOrder: (order: string[]) => Promise<void>;
  updateDurations: (durations: Record<string, number>) => Promise<void>;
}

export function useCompositionState(instanceId: string): UseCompositionStateReturn {
  const [state, setState] = useState<CompositionStateData>({
    order: [],
    durations: {},
    version: 0,
    loading: true,
    error: null,
    source: 'cache',
  });
  const versionRef = useRef(0);

  // Load: backend API first, fallback to cache
  useEffect(() => {
    if (!instanceId) return;
    let cancelled = false;

    // Start with cache for instant render
    setState(prev => ({
      ...prev,
      order: getCachedOrder(instanceId),
      durations: getCachedDurations(instanceId),
      loading: true,
      source: 'cache',
    }));

    // Try backend API
    getCompositionState(instanceId).then(apiState => {
      if (cancelled) return;
      const order = apiState.composition_order;
      const durations = apiState.timeline_durations;
      versionRef.current = apiState.version;
      // Sync cache
      setCachedOrder(instanceId, order);
      setCachedDurations(instanceId, durations);
      setState({ order, durations, version: apiState.version, loading: false, error: null, source: 'api' });
    }).catch(err => {
      if (cancelled) return;
      setState(prev => ({
        ...prev,
        loading: false,
        error: err?.message || 'Backend unavailable, using local cache',
        source: 'cache',
      }));
    });

    return () => { cancelled = true; };
  }, [instanceId]);

  const updateOrder = useCallback(async (order: string[]) => {
    if (!instanceId) return;
    // Optimistic cache update
    setCachedOrder(instanceId, order);
    setState(prev => ({ ...prev, order }));
    // Try backend
    try {
      const result = await putCompositionState(instanceId, order, state.durations, versionRef.current || 1);
      setCachedOrder(instanceId, result.composition_order);
      setCachedDurations(instanceId, result.timeline_durations);
      versionRef.current = result.version;
      setState(prev => ({ ...prev, version: result.version, error: null, source: 'api' as const }));
    } catch (err: any) {
      if (err?.message?.includes('409')) {
        // Version conflict — reload from backend
        try {
          const fresh = await getCompositionState(instanceId);
          versionRef.current = fresh.version;
          setCachedOrder(instanceId, fresh.composition_order);
          setCachedDurations(instanceId, fresh.timeline_durations);
          setState(prev => ({ ...prev, order: fresh.composition_order, durations: fresh.timeline_durations, version: fresh.version, error: null, source: 'api' as const }));
        } catch { /* keep cache */ }
      }
    }
  }, [instanceId, state.durations]);

  const updateDurations = useCallback(async (durations: Record<string, number>) => {
    if (!instanceId) return;
    setCachedDurations(instanceId, durations);
    setState(prev => ({ ...prev, durations }));
    try {
      const result = await putCompositionState(instanceId, state.order, durations, versionRef.current || 1);
      setCachedDurations(instanceId, result.timeline_durations);
      versionRef.current = result.version;
      setState(prev => ({ ...prev, version: result.version, error: null, source: 'api' as const }));
    } catch (err: any) {
      if (err?.message?.includes('409')) {
        try {
          const fresh = await getCompositionState(instanceId);
          versionRef.current = fresh.version;
          setCachedDurations(instanceId, fresh.timeline_durations);
          setState(prev => ({ ...prev, durations: fresh.timeline_durations, version: fresh.version, error: null, source: 'api' as const }));
        } catch { /* keep cache */ }
      }
    }
  }, [instanceId, state.order]);

  return { ...state, updateOrder, updateDurations };
}
