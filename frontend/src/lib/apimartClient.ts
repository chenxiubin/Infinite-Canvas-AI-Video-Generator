import type { ApimartModelInfo } from '../types/modelSettings';
import builtinModels from '../config/apimart-video-models.json';

export interface ConnectionTestResult {
  success: boolean;
  status: 'ok' | 'invalid_key' | 'network_error' | 'unknown';
  message: string;
}

export async function testApimartConnection(
  apiKey: string,
  baseUrl: string,
): Promise<ConnectionTestResult> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, status: 'invalid_key', message: 'API Key 无效或无权限' };
    }
    if (res.ok) {
      return { success: true, status: 'ok', message: '连接成功' };
    }
    return { success: false, status: 'unknown', message: `服务器返回 ${res.status}` };
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      return { success: false, status: 'network_error', message: '连接超时，请检查网络或代理设置' };
    }
    return {
      success: false,
      status: 'network_error',
      message: '浏览器直连失败，可能需要本地代理模式。当前仍可使用内置模型列表。',
    };
  }
}

export async function fetchApimartModels(
  apiKey: string,
  baseUrl: string,
): Promise<ApimartModelInfo[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`APIMart 模型列表获取失败：${res.status}`);
  }
  const json = await res.json();
  return normalizeApimartModels(json.data || []);
}

function normalizeApimartModels(rawModels: any[]): ApimartModelInfo[] {
  return rawModels
    .filter((m: any) => {
      const id = (m.id || '').toLowerCase();
      // Filter for video-capable models
      return id.includes('video') || id.includes('seedance') || id.includes('sora') ||
        id.includes('veo') || id.includes('wan') || id.includes('kling') || id.includes('vidu');
    })
    .map((m: any) => ({
      id: m.id || `remote-${Date.now()}`,
      name: m.id || '未知模型',
      provider: 'apimart' as const,
      category: 'video' as const,
      inputModes: ['text', 'image'] as Array<'text' | 'image'>,
      costLevel: '未知' as const,
      source: 'remote' as const,
    }));
}

export function getBuiltinVideoModels(): ApimartModelInfo[] {
  return (builtinModels as ApimartModelInfo[]).map(m => ({ ...m, source: 'builtin' as const }));
}

export function mergeBuiltinAndRemoteModels(
  builtin: ApimartModelInfo[],
  remote: ApimartModelInfo[],
): ApimartModelInfo[] {
  const remoteIds = new Set(remote.map(r => r.id));
  const merged = [...remote];
  builtin.forEach(b => {
    if (!remoteIds.has(b.id)) merged.push(b);
  });
  return merged;
}

export function findModelById(
  models: ApimartModelInfo[],
  modelId: string,
): ApimartModelInfo | undefined {
  return models.find(m => m.id === modelId);
}
