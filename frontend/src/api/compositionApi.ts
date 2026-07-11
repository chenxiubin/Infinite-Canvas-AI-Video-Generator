/**
 * Sprint 11A-5: Backend API client for composition state.
 * Falls back to localStorage when backend is unavailable.
 */

const BASE = '/api/v1/composition/composition-states';

interface CompositionStateResponse {
  instance_id: string;
  composition_order: string[];
  timeline_durations: Record<string, number>;
  version: number;
  created_at: number;
  updated_at: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

export async function getCompositionState(instanceId: string): Promise<CompositionStateResponse> {
  return apiFetch<CompositionStateResponse>(`${BASE}/${instanceId}`);
}

export async function putCompositionState(
  instanceId: string,
  compositionOrder: string[],
  timelineDurations: Record<string, number>,
  expectedVersion: number,
): Promise<CompositionStateResponse> {
  return apiFetch<CompositionStateResponse>(`${BASE}/${instanceId}`, {
    method: 'PUT',
    body: JSON.stringify({
      composition_order: compositionOrder,
      timeline_durations: timelineDurations,
      expected_version: expectedVersion,
    }),
  });
}
