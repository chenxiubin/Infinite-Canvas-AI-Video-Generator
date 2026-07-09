export type ModelProvider = 'mock' | 'apimart';
export type ModelCategory = 'video' | 'image' | 'text';

export interface ApimartModelInfo {
  id: string;
  name: string;
  provider: 'apimart';
  category: ModelCategory;
  inputModes: Array<'text' | 'image' | 'video' | 'audio'>;
  supportsFirstFrame?: boolean;
  supportsLastFrame?: boolean;
  maxReferenceImages?: number;
  aspectRatios?: string[];
  durations?: number[];
  resolutions?: string[];
  supportsAudio?: boolean;
  costLevel: '低' | '中' | '高' | '未知';
  recommendedFor?: string[];
  description?: string;
  source: 'builtin' | 'remote';
}

export interface UserModelSettings {
  provider: ModelProvider;
  apimartApiKey: string;
  apimartBaseUrl: string;
  selectedVideoModelId: string;
  selectedImageModelId?: string;
  selectedTextModelId?: string;
  defaultVideoDuration: number;
  defaultVideoResolution: string;
  defaultAspectRatio: string;
  defaultVideoAudio: boolean;
  maxConcurrentTasks: number;
  updatedAt: number;
}

export const DEFAULT_USER_MODEL_SETTINGS: UserModelSettings = {
  provider: 'mock',
  apimartApiKey: '',
  apimartBaseUrl: 'https://api.apimart.ai/v1',
  selectedVideoModelId: 'doubao-seedance-1-5-pro',
  defaultVideoDuration: 5,
  defaultVideoResolution: '720p',
  defaultAspectRatio: '3:4',
  defaultVideoAudio: false,
  maxConcurrentTasks: 1,
  updatedAt: 0,
};
