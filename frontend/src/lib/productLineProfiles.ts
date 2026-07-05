export type ProductLine = 'desk_calendar' | 'wall_calendar';

export interface ShotProfile {
  shot_name: string;
  camera_move: string;
  motion_intensity: string;
  context_hint: string;
}

export interface ProductLineProfile {
  label: string;
  S03: ShotProfile;
  S04_primary: ShotProfile;
  S04_backup: ShotProfile;
  S05: ShotProfile;
  materials: { shot: string; label: string }[];
  materials_backup: string[];
}

export const DESK_PROFILE: ProductLineProfile = {
  label: '台历',
  S03: { shot_name: '细节特写-结构', camera_move: '静止', motion_intensity: '轻微', context_hint: '底座/翻页装订结构' },
  S04_primary: { shot_name: '运镜展示', camera_move: '轻微平移', motion_intensity: '轻微', context_hint: '手部翻页动作定格瞬间' },
  S04_backup: { shot_name: '运镜展示', camera_move: '推进', motion_intensity: '轻微', context_hint: '台历与桌面常见物件同框展示尺寸对比' },
  S05: { shot_name: '场景陈列', camera_move: '拉远', motion_intensity: '中等', context_hint: '书桌/办公场景陈列' },
  materials: [
    { shot: 'S01', label: '产品完整正面图' },
    { shot: 'S02', label: '材质/纸张质感图' },
    { shot: 'S03', label: '台历底座/翻页装订结构图' },
    { shot: 'S04', label: '手部翻页定格图' },
    { shot: 'S05', label: '书桌/办公场景图' },
    { shot: 'S06', label: '产品整体收尾图' },
  ],
  materials_backup: ['台历与咖啡杯、钢笔等桌面参照物同框素材'],
};

export const WALL_PROFILE: ProductLineProfile = {
  label: '挂历',
  S03: { shot_name: '细节特写-结构', camera_move: '静止', motion_intensity: '轻微', context_hint: '挂绳/装订孔结构' },
  S04_primary: { shot_name: '运镜展示', camera_move: '轻微平移', motion_intensity: '轻微', context_hint: '整体展开/悬挂中间状态定格瞬间' },
  S04_backup: { shot_name: '运镜展示', camera_move: '推进', motion_intensity: '轻微', context_hint: '挂历与门框/墙面参照物同框展示尺寸对比' },
  S05: { shot_name: '场景陈列', camera_move: '拉远', motion_intensity: '中等', context_hint: '客厅墙面/玄关场景陈列' },
  materials: [
    { shot: 'S01', label: '产品完整正面图' },
    { shot: 'S02', label: '材质/纸张质感图' },
    { shot: 'S03', label: '挂绳/装订孔结构图' },
    { shot: 'S04', label: '悬挂展开定格图' },
    { shot: 'S05', label: '客厅墙面/玄关场景图' },
    { shot: 'S06', label: '产品整体收尾图' },
  ],
  materials_backup: ['挂历与门框、墙面参照物同框素材'],
};

export function getProfile(pl: ProductLine): ProductLineProfile {
  return pl === 'wall_calendar' ? WALL_PROFILE : DESK_PROFILE;
}
