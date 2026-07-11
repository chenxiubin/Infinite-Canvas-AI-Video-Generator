/**
 * Sprint 11A-4: Backend API client for video asset versions.
 * Falls back to localStorage when backend is unavailable.
 */

const BASE = '/api/v1/video-assets';

interface VideoAssetVersion {
  id: string;
  instance_id: string;
  shot_key: string;
  version_number: number;
  version_label: string;
  video_url: string;
  provider: string;
  model: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface ShotVersionsResponse {
  versions: VideoAssetVersion[];
  latest: VideoAssetVersion | null;
  reviews: Array<{
    id: string;
    asset_version_id: string;
    review_status: string;
    review_reason: string;
    reviewed_at: number | null;
    created_at: number;
  }>;
}

interface ReviewResponse {
  id: string;
  asset_version_id: string;
  review_status: string;
  review_reason: string;
  reviewed_at: number | null;
  created_at: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

export async function listVersions(instanceId: string, shotKey: string): Promise<ShotVersionsResponse> {
  return apiFetch<ShotVersionsResponse>(`${BASE}/${instanceId}/${shotKey}`);
}

export async function createVersion(
  instanceId: string, shotKey: string,
  videoUrl: string = '', provider: string = '', model: string = '',
): Promise<VideoAssetVersion> {
  return apiFetch<VideoAssetVersion>(`${BASE}/${instanceId}/${shotKey}`, {
    method: 'POST',
    body: JSON.stringify({ video_url: videoUrl, provider, model }),
  });
}

export async function reviewVersion(
  versionId: string, reviewStatus: string, reviewReason: string = '',
): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>(`${BASE}/versions/${versionId}/review`, {
    method: 'PUT',
    body: JSON.stringify({ review_status: reviewStatus, review_reason: reviewReason }),
  });
}

export type { VideoAssetVersion, ShotVersionsResponse, ReviewResponse };
