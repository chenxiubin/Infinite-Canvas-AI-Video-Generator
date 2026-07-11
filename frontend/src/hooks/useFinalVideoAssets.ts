/**
 * Sprint 11A-8: Backend-first final video assets hook.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type FinalVideoVersion, getFinalVideoVersions as getCached, setFinalVideoVersions as setCached,
  getCurrentFinalVideoId as getCachedCurrent, setCurrentFinalVideoId as setCachedCurrent,
} from '../lib/productionStateStore';

const API_BASE = '/api/v1/composition/final-video-assets';

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

interface UseFinalVideoAssetsReturn {
  assets: FinalVideoVersion[];
  currentAsset: FinalVideoVersion | null;
  loading: boolean;
  error: string | null;
  refreshAssets: () => Promise<void>;
  createAsset: (videoUrl: string, jobId?: string) => Promise<void>;
  switchCurrent: (assetId: string) => Promise<void>;
}

export function useFinalVideoAssets(instanceId: string): UseFinalVideoAssetsReturn {
  const [assets, setAssets] = useState<FinalVideoVersion[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!instanceId) { setLoading(false); return; }
    try {
      const data = await apiFetch<any[]>(`${API_BASE}/${instanceId}`);
      const mapped: FinalVideoVersion[] = data.map((a: any) => ({
        versionId: a.id,
        videoUrl: a.video_url,
        createdAt: a.created_at * 1000,
        status: a.status,
        errorMessage: a.error_message,
      }));
      setAssets(mapped);
      setCached(instanceId, mapped);
      const current = mapped.find(a => a.is_current) || mapped[mapped.length - 1] || null;
      if (current) { setCurrentId(current.versionId); setCachedCurrent(instanceId, current.versionId); }
      setError(null);
    } catch {
      const cached = getCached(instanceId);
      if (cached.length) { setAssets(cached); setCurrentId(getCachedCurrent(instanceId)); }
      else { setError('Backend unavailable'); }
    } finally { setLoading(false); }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  const createAsset = useCallback(async (videoUrl: string, jobId?: string) => {
    if (!instanceId) return;
    const params = new URLSearchParams({ instance_id: instanceId, video_url: videoUrl });
    if (jobId) params.set('composition_job_id', jobId);
    try {
      await apiFetch(`${API_BASE}?${params}`, { method: 'POST' });
      await load();
    } catch (err: any) { setError(err?.message); }
  }, [instanceId, load]);

  const switchCurrent = useCallback(async (assetId: string) => {
    if (!instanceId) return;
    try {
      await apiFetch(`${API_BASE}/${assetId}/current?instance_id=${instanceId}`, { method: 'PUT' });
      setCurrentId(assetId);
      setCachedCurrent(instanceId, assetId);
    } catch (err: any) { setError(err?.message); }
  }, [instanceId]);

  return {
    assets,
    currentAsset: assets.find(a => a.versionId === currentId) || assets[assets.length - 1] || null,
    loading, error, refreshAssets: load, createAsset, switchCurrent,
  };
}
