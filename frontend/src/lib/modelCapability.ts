import type { ApimartModelInfo } from '../types/modelSettings';

export interface ReferenceImagePolicy {
  useFirstFrame: boolean;
  useLastFrame: boolean;
  maxImages: number;
  warnings: string[];
}

export function getReferenceImagePolicy(
  model: ApimartModelInfo | undefined | null,
  referenceImageCount: number,
): ReferenceImagePolicy {
  const maxImages = model?.maxReferenceImages ?? 2;
  const supportsFirst = model?.supportsFirstFrame ?? true;
  const supportsLast = model?.supportsLastFrame ?? false;
  const warnings: string[] = [];

  if (referenceImageCount > maxImages) {
    warnings.push(`当前模型最多支持 ${maxImages} 张参考图，将只使用前 ${maxImages} 张。`);
  }
  if (referenceImageCount >= 2 && !supportsLast) {
    warnings.push('当前模型不支持尾帧，将忽略第二张参考图。');
  }
  if (referenceImageCount >= 2 && supportsLast) {
    // Fine: first as first frame, second as last frame
  }

  return {
    useFirstFrame: supportsFirst && referenceImageCount >= 1,
    useLastFrame: supportsLast && referenceImageCount >= 2,
    maxImages,
    warnings,
  };
}

export function getSupportedDurations(model: ApimartModelInfo | undefined | null): number[] {
  return model?.durations || [5];
}

export function getSupportedAspectRatios(model: ApimartModelInfo | undefined | null): string[] {
  return model?.aspectRatios || ['16:9'];
}
