import type { Node, Edge } from '@xyflow/react';

const SHOT_KEYS = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];
const NAMES: Record<string,string> = {S01_main:'主图-正面',S02_detail1:'细节特写-材质',S03_detail2:'细节特写-结构',S04_motion:'运镜展示',S05_scene:'场景陈列',S06_brand:'收尾呼应'};
const REF_COUNTS: Record<string,number> = {S01_main:1,S02_detail1:1,S03_detail2:1,S04_motion:2,S05_scene:1,S06_brand:1};

// Column-based layout: each shot has ref→shot→video in a column, merge at bottom
const COL_GAP = 200;
const REF_Y = 40;
const SHOT_Y = 240;
const VIDEO_Y = 520;
const MERGE_Y = 780;
const START_X = 20;

export function produceFixedLayout(productLine: string) {
  const pl = productLine || 'desk_calendar';
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  SHOT_KEYS.forEach((sk, i) => {
    const cx = START_X + i * COL_GAP;

    // Reference image nodes (above shot)
    const refCount = REF_COUNTS[sk] || 1;
    for (let ri = 0; ri < refCount; ri++) {
      const rx = refCount === 1 ? cx : cx - 50 + ri * 100;
      const label = ri === 0 ? '首帧参考' : '辅助参考';
      nodes.push({
        id: `ref-node-${sk}-${ri}`, type: 'referenceImageNode',
        position: { x: rx, y: REF_Y },
        data: { shot_key: sk, shot_name: NAMES[sk] || sk, ref_index: ri, role_label: label, product_line: pl },
        draggable: true,
      });
      edges.push({ id: `ref-edge-${sk}-${ri}`, source: `ref-node-${sk}-${ri}`, target: `shot-control-node-${sk}`, sourceHandle: 'source', type: 'default' as const, style: { stroke: '#6366f1', strokeWidth: 2 } });
    }

    // Shot control node (middle)
    nodes.push({
      id: `shot-control-node-${sk}`, type: 'shotControlNode',
      position: { x: cx, y: SHOT_Y },
      data: { shot_key: sk, shot_name: NAMES[sk] || sk, product_line: pl },
      draggable: true,
    });

    // Fixed video result node (below shot)
    nodes.push({
      id: `fixed-video-node-${sk}`, type: 'fixedVideoResultNode',
      position: { x: cx, y: VIDEO_Y },
      data: { shot_key: sk, shot_name: NAMES[sk] || sk, product_line: pl },
      draggable: true,
    });
    edges.push({ id: `shot-video-edge-${sk}`, source: `shot-control-node-${sk}`, target: `fixed-video-node-${sk}`, sourceHandle: 'source', targetHandle: 'target', type: 'default', style: { stroke: '#6366f1', strokeWidth: 2 } });

    // Video → merge edge
    edges.push({ id: `video-merge-edge-${sk}`, source: `fixed-video-node-${sk}`, target: 'merge-node', sourceHandle: 'source', targetHandle: 'target', type: 'default', style: { stroke: '#6366f1', strokeWidth: 2 } });
  });

  // Merge node at bottom center
  const midX = START_X + 3 * COL_GAP;
  nodes.push({
    id: 'merge-node', type: 'mergeNode',
    position: { x: midX, y: MERGE_Y },
    data: { product_line: pl },
    draggable: true,
  });

  return { nodes, edges };
}
