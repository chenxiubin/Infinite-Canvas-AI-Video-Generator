import React, { useState } from 'react';
import * as api from '../api/mvp3';

interface NodeDetail {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string;
  prompt?: string; video_url?: string; cover_url?: string; error_message?: string;
}

interface Props {
  node: NodeDetail;
  onClose: () => void;
  onRefresh: () => void;
  instanceId: string;
}

export const CanvasNodeDetailPanel: React.FC<Props> = ({ node, onClose, onRefresh, instanceId }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doAction = async (fn: () => Promise<any>) => {
    try { setError(''); setLoading(true); await fn(); await onRefresh(); } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  };

  return (
    <div data-testid="canvas-node-detail-panel" className="fixed right-0 top-0 w-96 h-full bg-[#1e293b] border-l border-white/10 shadow-2xl z-50 overflow-y-auto p-5 text-sm text-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">节点详情</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {error && <div data-testid="canvas-detail-error-message" className="bg-red-900/50 text-red-300 px-3 py-2 rounded mb-3 text-xs">{error}</div>}
      {loading && <div className="text-blue-400 text-xs mb-2">Processing...</div>}

      <div className="space-y-2 text-xs">
        <div><span className="text-gray-500">shot_key:</span> <span data-testid="canvas-detail-shot-key">{node.shot_key}</span></div>
        <div><span className="text-gray-500">shot_name:</span> {node.shot_name}</div>
        <div><span className="text-gray-500">shot_order:</span> {node.shot_order}</div>
        <div><span className="text-gray-500">status:</span> <span data-testid="canvas-detail-status">{node.status}</span></div>
        <div><span className="text-gray-500">review_status:</span> <span data-testid="canvas-detail-review-status">{node.review_status || '-'}</span></div>
        <div><span className="text-gray-500">required_asset_role:</span> {node.required_asset_role}</div>
        <div><span className="text-gray-500">bound_asset_role:</span> {node.bound_asset_role || '-'}</div>
        <div><span className="text-gray-500">bound_asset_source:</span> {node.bound_asset_source || '-'}</div>
        <div><span className="text-gray-500">duration:</span> {node.duration_seconds}s</div>
        <div><span className="text-gray-500">video_url:</span> <span data-testid="canvas-detail-video-url" className="text-green-400 break-all">{node.video_url || 'none'}</span></div>
        {node.cover_url && <div><span className="text-gray-500">cover_url:</span> <span className="text-green-400 break-all">{node.cover_url}</span></div>}
        {node.prompt && <div><span className="text-gray-500">prompt:</span> <span className="text-gray-400 break-all text-[10px]">{node.prompt}</span></div>}
        {node.error_message && <div><span className="text-gray-500">error:</span> <span className="text-red-400">{node.error_message}</span></div>}
      </div>

      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        {node.status === 'failed' && (
          <button data-testid="canvas-detail-retry-button"
            onClick={() => doAction(() => api.retryVideoNode(node.node_id))}
            className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded w-full">Retry</button>
        )}
        {node.status === 'success' && (
          <>
            <button data-testid="canvas-detail-approve-button"
              onClick={() => doAction(() => api.reviewVideoNode(node.node_id, 'approve'))}
              className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded w-full">Approve</button>
            <input data-testid="canvas-detail-reject-reason" placeholder="reject reason" value={reason}
              onChange={e => setReason(e.target.value)}
              className="bg-[#0f172a] border border-white/10 rounded px-2 py-1 text-xs w-full" />
            <button data-testid="canvas-detail-reject-button"
              onClick={() => { if (!reason) { setError('Reason required for reject'); return; } doAction(() => api.reviewVideoNode(node.node_id, 'reject', reason)); }}
              className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded w-full">Reject</button>
          </>
        )}
      </div>
    </div>
  );
};
