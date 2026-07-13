import type { ApimartModelInfo } from '../types/modelSettings';

function joinApimartUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export type UnifiedGenerationStatus =
  | 'idle' | 'uploading' | 'queued' | 'generating' | 'success' | 'failed';

export interface ApimartUploadedImage {
  url: string;
  filename?: string;
  contentType?: string;
  bytes?: number;
  createdAt?: number;
}

export interface ApimartVideoGenerationRequest {
  model: string;
  prompt: string;
  duration: number;
  aspect_ratio: string;
  resolution: string;
  audio: boolean;
  image_urls?: string[];
  image_with_roles?: Array<{ url: string; role: 'first_frame' | 'last_frame' }>;
}

export interface ApimartVideoTask {
  taskId: string;
  provider: 'apimart';
  model: string;
  status: UnifiedGenerationStatus;
  progress: number;
  videoUrl?: string;
  errorMessage?: string;
  rawStatus?: string;
}

export interface VideoGenerationTaskState {
  shotKey: string;
  provider: 'mock' | 'apimart';
  model: string;
  taskId?: string;
  status: UnifiedGenerationStatus;
  progress: number;
  errorMessage?: string;
  warningMessages?: string[];
  startedAt: number;
  updatedAt: number;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

export function sanitizeError(e: any): string {
  return e?.message || String(e || '').slice(0, 200);
}

// ── Image Upload ──

export async function uploadImageToApimart(
  apiKey: string,
  baseUrl: string,
  file: Blob,
  filename: string,
  mimeType: string,
): Promise<ApimartUploadedImage> {
  const form = new FormData();
  form.append('file', file, filename);
  const url = joinApimartUrl(baseUrl, '/uploads/images');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`图片上传失败: ${res.status}${text ? ' ' + text.slice(0, 100) : ''}`);
  }
  const json = await res.json();
  return {
    url: json.url || json.data?.url || '',
    filename: json.filename || json.data?.filename || filename,
    contentType: json.content_type || json.data?.content_type || mimeType,
    bytes: json.bytes || json.data?.bytes,
    createdAt: json.created_at || json.data?.created_at,
  };
}

// ── Video Generation Submit ──

export async function submitApimartVideoGeneration(
  apiKey: string,
  baseUrl: string,
  request: ApimartVideoGenerationRequest,
): Promise<string> {
  const url = joinApimartUrl(baseUrl, '/videos/generations');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`视频生成任务提交失败: ${res.status}${text ? ' ' + text.slice(0, 200) : ''}`);
  }
  const json = await res.json();
  return json.task_id || (Array.isArray(json.data) ? json.data[0]?.task_id : json.data?.task_id) || json.id || '';
}

// ── Task Status Poll ──

export async function getApimartTaskStatus(
  apiKey: string,
  baseUrl: string,
  taskId: string,
): Promise<{ status: string; progress: number; result?: any; error?: any }> {
  const url = joinApimartUrl(baseUrl, `/tasks/${taskId}?language=zh`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`任务状态查询失败: ${res.status}`);
  }
  const json = await res.json();
  return {
    status: json.status || json.data?.status || 'unknown',
    progress: json.progress ?? json.data?.progress ?? 0,
    result: json.result || json.data?.result,
    error: json.error || json.data?.error,
  };
}

// ── Status Normalization ──

export function normalizeApimartTaskStatus(rawStatus: string): UnifiedGenerationStatus {
  switch (rawStatus) {
    case 'pending': return 'queued';
    case 'processing': return 'generating';
    case 'completed': return 'success';
    case 'failed': return 'failed';
    case 'cancelled': return 'failed';
    default: return 'queued';
  }
}

export function normalizeApimartVideoUrl(result: any): string {
  if (!result) return '';
  let url: any = result.video_url || result.video?.url || result.video || result.url || result.videos?.[0]?.url || '';
  // Handle array-wrapped URLs (APIMart returns videos[0].url as string[])
  if (Array.isArray(url)) url = url[0] || '';
  // Defensive: ensure return is always a string
  return typeof url === 'string' ? url : String(url || '');
}

// ── Poll Loop ──

export async function pollApimartTask(
  apiKey: string,
  baseUrl: string,
  taskId: string,
  onUpdate: (task: ApimartVideoTask) => void,
  signal?: AbortSignal,
): Promise<ApimartVideoTask> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (signal?.aborted) throw new Error('已取消');
    const raw = await getApimartTaskStatus(apiKey, baseUrl, taskId);
    const status = normalizeApimartTaskStatus(raw.status);
    const task: ApimartVideoTask = {
      taskId,
      provider: 'apimart',
      model: '',
      status,
      progress: raw.progress,
      videoUrl: status === 'success' ? normalizeApimartVideoUrl(raw.result) : undefined,
      errorMessage: status === 'failed' ? sanitizeError(raw.error) : undefined,
      rawStatus: raw.status,
    };
    onUpdate(task);
    if (status === 'success' || status === 'failed') return task;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return {
    taskId, provider: 'apimart', model: '',
    status: 'failed', progress: 0,
    errorMessage: '轮询超时，请稍后重试',
  };
}

// ── Request Builder ──

export function buildApimartReferencePayload(
  modelInfo: ApimartModelInfo | undefined | null,
  uploadedImages: ApimartUploadedImage[],
): { image_urls?: string[]; image_with_roles?: Array<{ url: string; role: 'first_frame' | 'last_frame' }>; warnings: string[] } {
  const max = modelInfo?.maxReferenceImages ?? 2;
  const supportsLast = modelInfo?.supportsLastFrame ?? false;
  const warnings: string[] = [];
  const urls = uploadedImages.map(u => u.url).filter(Boolean);

  if (urls.length === 0) return { warnings: [] };

  // Truncate to max
  const usable = urls.slice(0, max);
  if (urls.length > max) {
    warnings.push(`当前模型最多支持 ${max} 张参考图，已按排序使用前 ${max} 张。`);
  }

  if (usable.length === 1) {
    return { image_urls: [usable[0]], warnings };
  }

  // 2 images
  if (supportsLast) {
    return {
      image_with_roles: [
        { url: usable[0], role: 'first_frame' },
        { url: usable[1], role: 'last_frame' },
      ],
      warnings,
    };
  }

  warnings.push('当前模型不支持尾帧，已忽略第二张参考图。');
  return { image_urls: [usable[0]], warnings };
}

export function buildApimartVideoRequest(
  modelInfo: ApimartModelInfo | undefined | null,
  prompt: string,
  duration: number,
  aspectRatio: string,
  resolution: string,
  audio: boolean,
  uploadedImages: ApimartUploadedImage[],
): { request: ApimartVideoGenerationRequest; warnings: string[] } {
  const { image_urls, image_with_roles, warnings } = buildApimartReferencePayload(modelInfo, uploadedImages);
  const request: ApimartVideoGenerationRequest = {
    model: modelInfo?.id || '',
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    resolution,
    audio,
  };
  if (image_with_roles?.length) request.image_with_roles = image_with_roles;
  else if (image_urls?.length) request.image_urls = image_urls;
  return { request, warnings };
}
