import React, { useState } from 'react';
import { CanvasNodeDetailPanel } from './CanvasNodeDetailPanel';

interface NodeItem {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string;
  prompt?: string; video_url?: string; cover_url?: string; error_message?: string;
}

interface Props {
  instance: any;
  nodes: NodeItem[];
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'border-gray-500 bg-gray-800',
  running: 'border-blue-500 bg-blue-900/30',
  success: 'border-green-500 bg-green-900/30',
  failed: 'border-red-500 bg-red-900/30',
};

const reviewColors: Record<string, string> = {
  not_required: 'text-gray-500', pending: 'text-yellow-400',
  approved: 'text-green-400', rejected: 'text-red-400',
  not_ready: 'text-gray-500',
};

export const ProductionCanvasView: React.FC<Props> = ({ instance, nodes, onRefresh }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  // Always derive the selected node from the latest nodes prop
  const selNode = nodes.find(n => n.node_id === selectedNodeId) ?? null;

  const noData = !instance || nodes.length === 0;

  return (
    <div data-testid="production-canvas-view" className="relative bg-[#0a0f1a] rounded-lg border border-white/10 overflow-hidden" style={{ minHeight: 400 }}>
      {/* Toolbar */}
      <div data-testid="canvas-toolbar" className="flex items-center gap-2 p-2 bg-[#1e293b] border-b border-white/10">
        <button data-testid="canvas-zoom-in" onClick={() => setScale(s => Math.min(s + 0.15, 2))} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded">Zoom In</button>
        <button data-testid="canvas-zoom-out" onClick={() => setScale(s => Math.max(s - 0.15, 0.3))} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded">Zoom Out</button>
        <button data-testid="canvas-reset-view" onClick={() => setScale(1)} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded">Reset</button>
        <span className="text-xs text-gray-500 ml-2">{Math.round(scale * 100)}%</span>
        {instance && (
          <div className="ml-auto flex gap-3 text-xs">
            <span data-testid="canvas-instance-status" className="text-gray-400">instance: {instance.status}</span>
            <span data-testid="canvas-instance-review-status" className="text-gray-400">review: {instance.review_status || '-'}</span>
            {instance.draft_preview_url && <span data-testid="canvas-draft-preview-url" className="text-green-400">{instance.draft_preview_url}</span>}
            {instance.final_video_url && <span data-testid="canvas-final-video-url" className="text-green-400">{instance.final_video_url}</span>}
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="overflow-auto p-4" style={{ maxHeight: 500 }}>
        {noData ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            请先创建 video batch
          </div>
        ) : (
          <div className="flex items-start gap-8" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', minWidth: 900 }}>
            {nodes.map((n, i) => (
              <React.Fragment key={n.node_id}>
                <div
                  data-testid={`canvas-node-${n.shot_key}`}
                  onClick={() => setSelectedNodeId(n.node_id)}
                  className={`cursor-pointer border-2 rounded-lg p-3 w-40 flex-shrink-0 transition-colors ${statusColors[n.status] || 'border-gray-600 bg-gray-800'} hover:border-white/50`}
                >
                  <div className="text-xs font-semibold text-gray-200">{n.shot_key}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{n.shot_name}</div>
                  <div className="mt-2 space-y-0.5 text-[10px]">
                    <div data-testid={`canvas-node-status-${n.shot_key}`}>status: <span className="font-medium">{n.status}</span></div>
                    <div data-testid={`canvas-node-review-${n.shot_key}`} className={reviewColors[n.review_status || ''] || 'text-gray-500'}>
                      review: {n.review_status || '-'}
                    </div>
                    <div className="text-gray-500">asset: {n.bound_asset_role || '-'}</div>
                    <div className="text-gray-600">source: {n.bound_asset_source || '-'}</div>
                  </div>
                </div>
                {i < nodes.length - 1 && (
                  <div className="flex items-center flex-shrink-0 text-gray-600 text-lg">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selNode && (
        <CanvasNodeDetailPanel
          node={selNode}
          instanceId={instance?.instance_id || ''}
          onClose={() => setSelectedNodeId(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};
