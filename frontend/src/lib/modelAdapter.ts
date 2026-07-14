import type { ApimartModelInfo } from '../types/modelSettings';

// ── Model Family ──

export type ApimartVideoFamily = 'doubao-1.5' | 'doubao-2.0' | 'veo3' | 'wan2.6' | 'kling' | 'vidu' | 'sora' | 'unsupported';

export function detectFamily(modelId: string): ApimartVideoFamily {
  const id = modelId.toLowerCase();
  if (id.includes('seedance-1-5') || id.includes('seedance-1.5')) return 'doubao-1.5';
  if (id.includes('seedance-2') || id.includes('seedance-2.0')) return 'doubao-2.0';
  if (id.startsWith('veo3') || id.startsWith('veo-3')) return 'veo3';
  if (id.includes('wan2.6') || id.includes('wan-2.6')) return 'wan2.6';
  if (id.includes('kling')) return 'kling';
  if (id.includes('vidu')) return 'vidu';
  if (id.includes('sora')) return 'sora';
  return 'unsupported';
}

// ── Family Capability Tables ──

interface FamilyCapability {
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  supportsAudio: boolean;
  audioField: 'audio' | 'generate_audio' | null; // null = don't send
  maxReferenceImages: number;
  supportsLastFrame: boolean;
  usesAspectRatio: boolean; // false → use 'size' instead
}

const CAPABILITIES: Record<ApimartVideoFamily, FamilyCapability> = {
  'doubao-1.5': {
    durations: [4, 5, 8, 10, 12],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    resolutions: ['720p', '1080p'],
    supportsAudio: true,
    audioField: 'audio',
    maxReferenceImages: 2,
    supportsLastFrame: true,
    usesAspectRatio: true,
  },
  'doubao-2.0': {
    durations: [4, 5, 8, 10, 12, 16],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    resolutions: ['720p', '1080p'],
    supportsAudio: true,
    audioField: 'generate_audio',
    maxReferenceImages: 2,
    supportsLastFrame: true,
    usesAspectRatio: false, // uses 'size' instead
  },
  veo3: {
    durations: [8],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 1,
    supportsLastFrame: false,
    usesAspectRatio: true,
  },
  'wan2.6': {
    durations: [5],
    aspectRatios: ['16:9', '9:16', '1:1', '3:4'],
    resolutions: ['720p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 1,
    supportsLastFrame: false,
    usesAspectRatio: true,
  },
  kling: {
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1', '3:4'],
    resolutions: ['720p', '1080p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 2,
    supportsLastFrame: true,
    usesAspectRatio: true,
  },
  vidu: {
    durations: [4, 8],
    aspectRatios: ['16:9', '9:16', '1:1', '3:4'],
    resolutions: ['720p', '1080p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 2,
    supportsLastFrame: false,
    usesAspectRatio: true,
  },
  sora: {
    durations: [4, 8, 12],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 1,
    supportsLastFrame: false,
    usesAspectRatio: true,
  },
  unsupported: {
    durations: [5],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    supportsAudio: false,
    audioField: null,
    maxReferenceImages: 0,
    supportsLastFrame: false,
    usesAspectRatio: true,
  },
};

// Special VEO3 variant: veo3.1-lite does NOT support reference images
export function isVeo3Lite(modelId: string): boolean {
  return modelId.toLowerCase().includes('veo3.1-lite') || modelId.toLowerCase().includes('veo-3.1-lite');
}

// ── Capability Query ──

export function getFamilyCapability(modelId: string): FamilyCapability {
  return CAPABILITIES[detectFamily(modelId)] || CAPABILITIES.unsupported;
}

export function getSupportedDurations(modelId: string): number[] {
  return getFamilyCapability(modelId).durations;
}

export function getSupportedAspectRatios(modelId: string): number[] {
  return getFamilyCapability(modelId).aspectRatios;
}

export function getSupportedResolutions(modelId: string): string[] {
  return getFamilyCapability(modelId).resolutions;
}

// ── Validation Result ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalizedDuration: number;
  normalizedAspectRatio: string;
  normalizedResolution: string;
  normalizedAudio: boolean;
}

// ── Pre-generation Validation ──

export function validateApimartVideoRequest(
  modelId: string,
  duration: number,
  aspectRatio: string,
  resolution: string,
  audio: boolean,
  referenceImageCount: number,
): ValidationResult {
  const family = detectFamily(modelId);
  const cap = getFamilyCapability(modelId);
  const errors: string[] = [];

  if (family === 'unsupported') {
    errors.push(`模型 "${modelId}" 的生成参数尚未适配，暂不可用于当前分镜。`);
    return { valid: false, errors, normalizedDuration: duration, normalizedAspectRatio: aspectRatio, normalizedResolution: resolution, normalizedAudio: audio };
  }

  // VEO3 lite special rules
  if (isVeo3Lite(modelId) && referenceImageCount > 0) {
    errors.push('veo3.1-lite 不支持参考图输入，当前分镜已有参考图。请更换模型或清除参考图。');
  }

  // Normalize with clamping
  let normDuration = duration;
  if (!cap.durations.includes(duration)) {
    normDuration = cap.durations[0];
    errors.push(`当前模型不支持 ${duration}s 时长，已自动调整为 ${normDuration}s。`);
  }

  let normAspect = aspectRatio;
  if (!cap.aspectRatios.includes(aspectRatio)) {
    normAspect = cap.aspectRatios[0];
    errors.push(`当前模型不支持比例 ${aspectRatio}，已自动调整为 ${normAspect}。`);
  }

  let normRes = resolution;
  if (!cap.resolutions.includes(resolution)) {
    normRes = cap.resolutions[0];
    errors.push(`当前模型不支持分辨率 ${resolution}，已自动调整为 ${normRes}。`);
  }

  let normAudio = audio;
  if (!cap.supportsAudio && audio) {
    normAudio = false;
    errors.push('当前模型不支持生成音频，已自动关闭。');
  }

  const valid = errors.every(e => e.includes('已自动调整') || e.includes('已自动关闭'));

  return { valid, errors, normalizedDuration: normDuration, normalizedAspectRatio: normAspect, normalizedResolution: normRes, normalizedAudio };
}

// ── Model-Specific Request Builder ──

export interface ModelSpecificRequest {
  body: Record<string, any>;
  warnings: string[];
  blocked?: boolean;
}

export function buildModelSpecificRequest(
  modelId: string,
  prompt: string,
  duration: number,
  aspectRatio: string,
  resolution: string,
  audio: boolean,
  imageUrls: string[],
  imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' }>,
): ModelSpecificRequest {
  const family = detectFamily(modelId);
  const cap = getFamilyCapability(modelId);

  if (family === 'unsupported') {
    return { body: { model: modelId, prompt }, warnings: ['该模型尚未适配，不能用于分镜生成。'], blocked: true };
  }

  const body: Record<string, any> = {
    model: modelId,
    prompt,
    duration,
    resolution,
  };

  // Aspect ratio or size
  if (cap.usesAspectRatio) {
    body.aspect_ratio = aspectRatio;
  } else {
    body.size = aspectRatio;
  }

  // Audio
  if (cap.audioField) {
    body[cap.audioField] = audio;
  }

  // Reference images
  const usable = imageUrls.slice(0, cap.maxReferenceImages);
  const warnings: string[] = [];
  if (imageUrls.length > cap.maxReferenceImages) {
    warnings.push(`当前模型最多支持 ${cap.maxReferenceImages} 张参考图，已使用前 ${cap.maxReferenceImages} 张。`);
  }

  if (imageWithRoles && imageWithRoles.length > 0 && cap.supportsLastFrame) {
    body.image_with_roles = imageWithRoles.slice(0, cap.maxReferenceImages);
  } else if (usable.length > 0) {
    body.image_urls = usable;
  }

  return { body, warnings };
}
