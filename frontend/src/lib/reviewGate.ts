// reviewGate.ts — approved-only merge gate helpers
// Each required shot must have status === 'success' AND review_status === 'approved'
// before merge/export can proceed.

const REQUIRED_SHOT_KEYS = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene', 'S06_brand'];

const SHOT_KEY_TO_SHORT: Record<string, string> = {
  'S01_main': 'S01',
  'S02_detail1': 'S02',
  'S03_detail2': 'S03',
  'S04_motion': 'S04',
  'S05_scene': 'S05',
  'S06_brand': 'S06',
};

function getShotShortName(shotKey: string): string {
  return SHOT_KEY_TO_SHORT[shotKey] || shotKey;
}

function isNodeApproved(node: any): boolean {
  return node?.status === 'success' && node?.review_status === 'approved';
}

/**
 * Returns true when every required shot node exists and has
 * status === 'success' AND review_status === 'approved'.
 */
export function allRequiredShotsApproved(nodes: any[]): boolean {
  return REQUIRED_SHOT_KEYS.every(sk => {
    const node = nodes.find(n => n.shot_key === sk);
    return isNodeApproved(node);
  });
}

/**
 * Returns the list of required shots that are NOT yet approved.
 * Each entry contains the full shotKey, a short display name (S01…S06),
 * and the current review_status (or 'missing' if no node found).
 */
export function getBlockedShots(nodes: any[]): { shotKey: string; shotName: string; reviewStatus: string }[] {
  return REQUIRED_SHOT_KEYS
    .map(sk => {
      const node = nodes.find(n => n.shot_key === sk);
      if (isNodeApproved(node)) return null;
      return {
        shotKey: sk,
        shotName: getShotShortName(sk),
        reviewStatus: node?.review_status || 'missing',
      };
    })
    .filter(Boolean) as { shotKey: string; shotName: string; reviewStatus: string }[];
}

/**
 * Returns a human-readable string explaining why merge/export is blocked,
 * or null if all required shots are approved.
 * Format: "请先审核通过全部分镜 · 未通过：S02、S04"
 */
export function getMergeDisabledReason(nodes: any[]): string | null {
  const blocked = getBlockedShots(nodes);
  if (blocked.length === 0) return null;
  const shortNames = blocked.map(b => b.shotName).join('、');
  return `请先审核通过全部分镜 · 未通过：${shortNames}`;
}
