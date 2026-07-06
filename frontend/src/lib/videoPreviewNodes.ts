// videoPreviewNodes.ts — derive video preview nodes and edges from shot data

export interface ShotItem {
  shot_key: string;
  shot_name: string;
  video_url?: string;
  cover_url?: string;
  status: string;
  review_status?: string;
}

export interface VideoPreviewNodeData {
  shot_key: string;
  shot_name: string;
  video_url: string;
  cover_url?: string;
  status: string;
  review_status?: string;
}

/**
 * Derives video preview nodes (type: workbenchVideoPreview) and their
 * connecting edges from a list of shot items and their canvas positions.
 *
 * Only emits nodes for shots where status === 'success' && video_url exists.
 * Edge type is 'materialEdge' with data.bindingType = 'video_result'.
 */
export function deriveVideoPreviewNodes(
  shots: ShotItem[],
  shotPositions: Record<string, { x: number; y: number }>,
): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  for (const shot of shots) {
    if (shot.status !== 'success' || !shot.video_url) {
      continue;
    }

    const pos = shotPositions[shot.shot_key];
    if (!pos) {
      continue;
    }

    const previewNodeId = `video-preview-${shot.shot_key}`;

    nodes.push({
      id: previewNodeId,
      type: 'workbenchVideoPreview',
      position: { x: pos.x + 180, y: pos.y },
      data: {
        shot_key: shot.shot_key,
        shot_name: shot.shot_name,
        video_url: shot.video_url,
        cover_url: shot.cover_url,
        status: shot.status,
        review_status: shot.review_status,
        reject_reason: (shot as any).review_reason || (shot as any).reject_reason,
      } satisfies VideoPreviewNodeData,
    });

    edges.push({
      id: `video-preview-edge-${shot.shot_key}`,
      source: shot.shot_key,
      target: previewNodeId,
      type: 'materialEdge',
      data: {
        bindingType: 'video_result',
        label: '生成结果',
      },
    });
  }

  return { nodes, edges };
}
