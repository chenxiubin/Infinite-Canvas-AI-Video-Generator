/**
 * Sprint 11A-7: Backend-first composition job hook.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCompositionJob as getCachedJob, setCompositionJob as setCachedJob, type CompositionJob } from '../lib/productionStateStore';

const API_BASE = '/api/v1/composition/composition-jobs';

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

interface UseCompositionJobReturn {
  job: CompositionJob | null;
  loading: boolean;
  error: string | null;
  createJob: () => Promise<void>;
  refreshJob: () => Promise<void>;
  isProcessing: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}

export function useCompositionJob(instanceId: string): UseCompositionJobReturn {
  const [job, setJob] = useState<CompositionJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJob = useCallback(async () => {
    if (!instanceId) { setLoading(false); return; }
    try {
      const data = await apiFetch<any>(`${API_BASE}/instance/${instanceId}`);
      const j: CompositionJob = {
        status: data.status || 'idle',
        startedAt: data.started_at ? data.started_at * 1000 : undefined,
        completedAt: data.completed_at ? data.completed_at * 1000 : undefined,
        errorMessage: data.error_message,
      };
      setJob(j);
      setCachedJob(instanceId, j);
      setError(null);
    } catch {
      // Fallback to cache
      const cached = getCachedJob(instanceId);
      if (cached) { setJob(cached); setError(null); }
      else { setError('Backend unavailable'); }
    } finally { setLoading(false); }
  }, [instanceId]);

  // Initial load
  useEffect(() => { loadJob(); }, [loadJob]);

  // Poll when processing
  useEffect(() => {
    if (job?.status === 'processing') {
      pollRef.current = setInterval(loadJob, 3000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [job?.status, loadJob]);

  const createJob = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const data = await apiFetch<any>(API_BASE, {
        method: 'POST',
        body: JSON.stringify({ instance_id: instanceId }),
      });
      const j: CompositionJob = {
        status: data.status || 'queued',
        startedAt: data.started_at ? data.started_at * 1000 : undefined,
        completedAt: undefined,
      };
      setJob(j);
      setCachedJob(instanceId, j);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to create job');
    } finally { setLoading(false); }
  }, [instanceId]);

  const refreshJob = useCallback(async () => { await loadJob(); }, [loadJob]);

  return {
    job,
    loading,
    error,
    createJob,
    refreshJob,
    isProcessing: job?.status === 'processing',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
  };
}
