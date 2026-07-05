export interface StoryboardPromptConfig {
  shot_size: string;
  camera_move: string;
  lighting_mood: string;
  motion_intensity: string;
  defocus_level: string;
  safety_margin: number;
  custom_prompt_override?: string;
  is_prompt_customized: boolean;
  safety_suffix_enabled: boolean;
}

export const SHOT_SIZE_OPTIONS = ['特写', '中景', '远景'] as const;
export const CAMERA_MOVE_OPTIONS = ['静止', '推进', '拉远', '轻微平移'] as const;
export const LIGHTING_MOOD_OPTIONS = ['清透高饱和', '暖光节日氛围', '侧光质感', '自然生活光', '冷调简约'] as const;
export const MOTION_INTENSITY_OPTIONS = ['轻微', '中等'] as const;
export const DEFOCUS_LEVEL_OPTIONS = ['无虚化', '轻度虚化', '强虚化'] as const;

export const SAFETY_SUFFIX = '保持产品结构与首帧内容一致，不脑补画面外结构。';

const SHOT_SIZE_LABEL: Record<string, string> = { '特写': '特写构图', '中景': '中景构图', '远景': '远景构图' };
const CAMERA_MOVE_LABEL: Record<string, string> = { '静止': '静止机位', '推进': '缓慢推进运镜', '拉远': '缓慢拉远运镜', '轻微平移': '轻微平移运镜' };
const LIGHTING_LABEL: Record<string, string> = { '清透高饱和': '清透高饱和', '暖光节日氛围': '暖光节日氛围', '侧光质感': '侧光质感', '自然生活光': '自然生活光', '冷调简约': '冷调简约' };
const MOTION_LABEL: Record<string, string> = { '轻微': '轻微运动幅度', '中等': '中等运动幅度' };
const DEFOCUS_LABEL: Record<string, string> = { '无虚化': '无背景虚化', '轻度虚化': '轻度背景虚化', '强虚化': '强背景虚化' };

export function buildStandardShotPrompt(config: StoryboardPromptConfig): string {
  const parts: string[] = [];
  parts.push(SHOT_SIZE_LABEL[config.shot_size] || config.shot_size);
  parts.push(CAMERA_MOVE_LABEL[config.camera_move] || config.camera_move);
  parts.push(LIGHTING_LABEL[config.lighting_mood] || config.lighting_mood);
  parts.push(MOTION_LABEL[config.motion_intensity] || config.motion_intensity);
  parts.push(DEFOCUS_LABEL[config.defocus_level] || config.defocus_level);
  const movesWithSafety = ['推进', '拉远'];
  if (movesWithSafety.includes(config.camera_move)) {
    parts.push(`安全边距${config.safety_margin}%`);
  }
  return parts.join('，') + '。';
}

export function buildFinalPrompt(config: StoryboardPromptConfig): string {
  const base = config.is_prompt_customized && config.custom_prompt_override
    ? config.custom_prompt_override
    : buildStandardShotPrompt(config);
  if (config.safety_suffix_enabled) {
    return base + ' ' + SAFETY_SUFFIX;
  }
  return base;
}

export function getDefaultStoryboardConfig(s: string, productLine?: 'desk_calendar' | 'wall_calendar', motionShotVersion?: 'primary' | 'backup'): StoryboardPromptConfig {
  const pl = productLine || 'desk_calendar';
  const isWall = pl === 'wall_calendar';
  const isBackup = motionShotVersion === 'backup';
  const shared: Record<string, StoryboardPromptConfig> = {
    S01_main:    { shot_size: '中景', camera_move: '推进', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
    S02_detail1: { shot_size: '特写', camera_move: '静止', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
    S06_brand:   { shot_size: '中景', camera_move: '拉远', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
  };
  const desk_s04_primary: StoryboardPromptConfig = { shot_size: '中景', camera_move: '轻微平移', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true };
  const desk_s04_backup:  StoryboardPromptConfig = { shot_size: '中景', camera_move: '推进', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true };
  const wall_s04_primary: StoryboardPromptConfig = { shot_size: '中景', camera_move: '轻微平移', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true };
  const wall_s04_backup:  StoryboardPromptConfig = { shot_size: '中景', camera_move: '推进', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true };
  const desk_cfgs: Record<string, StoryboardPromptConfig> = {
    ...shared,
    S03_detail2: { shot_size: '特写', camera_move: '静止', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
    S04_motion:  isBackup ? desk_s04_backup : desk_s04_primary,
    S05_scene:   { shot_size: '远景', camera_move: '拉远', lighting_mood: '清透高饱和', motion_intensity: '中等', defocus_level: '无虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
  };
  const wall_cfgs: Record<string, StoryboardPromptConfig> = {
    ...shared,
    S03_detail2: { shot_size: '特写', camera_move: '静止', lighting_mood: '清透高饱和', motion_intensity: '轻微', defocus_level: '轻度虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
    S04_motion:  isBackup ? wall_s04_backup : wall_s04_primary,
    S05_scene:   { shot_size: '远景', camera_move: '拉远', lighting_mood: '清透高饱和', motion_intensity: '中等', defocus_level: '无虚化', safety_margin: 8, is_prompt_customized: false, safety_suffix_enabled: true },
  };
  const defaults = isWall ? wall_cfgs : desk_cfgs;
  return defaults[s] || defaults['S01_main'];
}
