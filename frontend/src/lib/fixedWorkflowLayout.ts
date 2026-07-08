import type { Node, Edge } from '@xyflow/react';

// Desk calendar: 6-shot workflow
const DESK_KEYS = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];
const DESK_NAMES: Record<string,string> = {S01_main:'主图-正面',S02_detail1:'细节特写-材质',S03_detail2:'细节特写-结构',S04_motion:'运镜展示',S05_scene:'场景陈列',S06_brand:'收尾-品牌'};
const DESK_REF: Record<string,number> = {S01_main:1,S02_detail1:1,S03_detail2:1,S04_motion:2,S05_scene:1,S06_brand:1};

// Wall calendar: 7-shot workflow
const WALL_KEYS = ['W01_main','W02_hanging','W03_detail1','W04_detail2','W05_scene','W06_size','W07_brand'];
const WALL_NAMES: Record<string,string> = {W01_main:'挂历-正面展示',W02_hanging:'上墙悬挂展示',W03_detail1:'纸张与印刷细节',W04_detail2:'装订与挂孔结构',W05_scene:'家居/办公墙面场景',W06_size:'尺寸与空间比例',W07_brand:'收尾-品牌'};
const WALL_REF: Record<string,number> = {W01_main:1,W02_hanging:1,W03_detail1:1,W04_detail2:1,W05_scene:1,W06_size:1,W07_brand:1};

const COL_GAP = 200;
const REF_Y = 40;
const SHOT_Y = 240;
const VIDEO_Y = 520;
const MERGE_Y = 780;
const START_X = 20;

function buildLayout(keys: string[], names: Record<string,string>, refCounts: Record<string,number>, pl: string) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  keys.forEach((sk, i) => {
    const cx = START_X + i * COL_GAP;
    const refCount = refCounts[sk] || 1;

    for (let ri = 0; ri < refCount; ri++) {
      const rx = refCount === 1 ? cx : cx - 50 + ri * 100;
      const label = ri === 0 ? '首帧参考' : '辅助参考';
      nodes.push({
        id: `ref-node-${sk}-${ri}`, type: 'referenceImageNode',
        position: { x: rx, y: REF_Y },
        data: { shot_key: sk, shot_name: names[sk] || sk, ref_index: ri, role_label: label, product_line: pl },
        draggable: true,
      });
      edges.push({
        id: `ref-edge-${sk}-${ri}`, source: `ref-node-${sk}-${ri}`, target: `shot-control-node-${sk}`,
        sourceHandle: 'source', type: 'default' as const,
        style: { stroke: '#475569', strokeWidth: 1.2, opacity: 0.55 },
      });
    }

    nodes.push({
      id: `shot-control-node-${sk}`, type: 'shotControlNode',
      position: { x: cx, y: SHOT_Y },
      data: { shot_key: sk, shot_name: names[sk] || sk, product_line: pl },
      draggable: true,
    });

    nodes.push({
      id: `fixed-video-node-${sk}`, type: 'fixedVideoResultNode',
      position: { x: cx, y: VIDEO_Y },
      data: { shot_key: sk, shot_name: names[sk] || sk, product_line: pl },
      draggable: true,
    });
    edges.push({
      id: `shot-video-edge-${sk}`, source: `shot-control-node-${sk}`, target: `fixed-video-node-${sk}`,
      sourceHandle: 'source', targetHandle: 'target', type: 'default',
      style: { stroke: '#475569', strokeWidth: 1.2, opacity: 0.55 },
    });

    edges.push({
      id: `video-merge-edge-${sk}`, source: `fixed-video-node-${sk}`, target: 'merge-node',
      sourceHandle: 'source', targetHandle: 'target', type: 'default',
      style: { stroke: '#475569', strokeWidth: 1.2, opacity: 0.5 },
    });
  });

  const midX = START_X + Math.floor(keys.length / 2) * COL_GAP;
  nodes.push({
    id: 'merge-node', type: 'mergeNode',
    position: { x: midX, y: MERGE_Y },
    data: { product_line: pl, shotCount: keys.length },
    draggable: true,
  });

  return { nodes, edges };
}

export function produceFixedLayout(productLine: string, optionalShotEnabled?: boolean) {
  const pl = productLine || 'desk_calendar';
  let keys: string[], names: Record<string,string>, refs: Record<string,number>;
  if (pl === 'wall_calendar') {
    keys = [...WALL_KEYS]; names = { ...WALL_NAMES }; refs = { ...WALL_REF };
    if (optionalShotEnabled) {
      keys.push('W08_size_ref'); names['W08_size_ref'] = '尺寸参考同框'; refs['W08_size_ref'] = 1;
    }
  } else {
    keys = [...DESK_KEYS]; names = { ...DESK_NAMES }; refs = { ...DESK_REF };
    if (optionalShotEnabled) {
      keys.push('S07_size_ref'); names['S07_size_ref'] = '尺寸参考同框'; refs['S07_size_ref'] = 1;
    }
  }
  return buildLayout(keys, names, refs, pl);
}

// Export for external use (ProductWorkbench shotReferences derivation)
export const SHOT_KEYS_DESK = DESK_KEYS;
export const SHOT_KEYS_WALL = WALL_KEYS;
export const REF_COUNTS_DESK = DESK_REF;
export const REF_COUNTS_WALL = WALL_REF;
