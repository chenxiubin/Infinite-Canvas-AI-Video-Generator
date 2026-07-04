import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useOnViewportChange,
  type Node as RFNode, type Edge, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Package } from 'lucide-react';

interface NodeItem {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string;
  prompt?: string; video_url?: string; cover_url?: string; error_message?: string;
}

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; }
interface ShotFrameBinding { shotKey: string; startFrameAssetId?: string; endFrameAssetId?: string; referenceAssetIds?: string[]; }

interface Props {
  instance: any;
  nodes: NodeItem[];
  onRefresh: () => void;
  onSelectNode?: (node: NodeItem | null) => void;
  assets?: WorkbenchAsset[];
  shotBindings?: ShotFrameBinding[];
}

const DEFAULT_SHOTS = [
  { shot_key: 'S01_main', shot_name: '主图-正面', shot_order: 1, duration_seconds: 4, required_asset_role: 'main' },
  { shot_key: 'S02_detail1', shot_name: '细节-纸张质感', shot_order: 2, duration_seconds: 3, required_asset_role: 'detail1' },
  { shot_key: 'S03_detail2', shot_name: '细节-装订挂绳', shot_order: 3, duration_seconds: 3, required_asset_role: 'detail2' },
  { shot_key: 'S04_motion', shot_name: '运镜-整体翻动特写', shot_order: 4, duration_seconds: 5, required_asset_role: 'motion' },
  { shot_key: 'S05_scene', shot_name: '场景-挂墙陈列', shot_order: 5, duration_seconds: 5, required_asset_role: 'scene' },
  { shot_key: 'S06_brand', shot_name: '尾帧-LOGO', shot_order: 6, duration_seconds: 4, required_asset_role: 'brand' },
];

const statusColors: Record<string, string> = {
  pending: 'border-gray-600/50 bg-[#141a24]',
  running: 'border-blue-500/50 bg-blue-950/20',
  success: 'border-green-500/50 bg-green-950/15',
  failed: 'border-red-500/50 bg-red-950/20',
};
const statusDot: Record<string, string> = {
  pending: 'bg-gray-500', running: 'bg-blue-400 animate-pulse', success: 'bg-green-400', failed: 'bg-red-400',
};
const reviewBadge: Record<string, string> = {
  approved: 'text-green-400 bg-green-900/30 border-green-500/30',
  rejected: 'text-red-400 bg-red-900/30 border-red-500/30',
  pending: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30',
};

// Custom React Flow node — preserves ALL data-testids
const WorkbenchCanvasNode: React.FC<{ id: string; data: { item: any; onSelect?: (n: any) => void; assets?: WorkbenchAsset[]; binding?: ShotFrameBinding } }> = ({ id, data }) => {
  const n = data.item;
  const st = n.status || 'pending';
  const rv = n.review_status || '-';
  const rvCls = reviewBadge[rv] || 'text-gray-500 bg-gray-800 border-gray-600/20';
  const binding = data.binding;
  const sfAsset = data.assets?.find(a => a.id === binding?.startFrameAssetId);
  const efAsset = data.assets?.find(a => a.id === binding?.endFrameAssetId);
  const hasFrame = !!sfAsset;
  return (
    <div
      data-testid={`canvas-node-${n.shot_key}`}
      onClick={() => data.onSelect?.(n)}
      className={`cursor-pointer border-2 rounded-xl p-4 w-48 flex-shrink-0 transition-all duration-200 hover:border-white/20 hover:shadow-md ${statusColors[st] || statusColors.pending}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[st] || 'bg-gray-500'}`} />
        <span className="node-title text-xs font-semibold text-gray-100 truncate">{n.shot_name}</span>
      </div>
      <div className="text-[10px] text-gray-500 mb-1">{n.shot_key}</div>
      {/* Thumbnail or placeholder */}
      {sfAsset ? (
        <div className="mb-2 rounded-lg overflow-hidden border border-white/10">
          <img src={sfAsset.url} alt="首帧" className="w-full h-16 object-cover" />
          <div className="text-[8px] text-green-400 bg-green-900/30 px-1.5 py-0.5 text-center">{hasFrame && efAsset ? '首尾帧已就绪' : '首帧已绑定'}</div>
        </div>
      ) : (
        <div className="mb-2 rounded-lg border border-dashed border-amber-700/40 bg-amber-900/10 h-16 flex items-center justify-center">
          <span className="text-[9px] text-amber-500">缺少首帧</span>
        </div>
      )}
      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${st === 'success' ? 'text-green-300 bg-green-900/40' : st === 'running' ? 'text-blue-300 bg-blue-900/40' : st === 'failed' ? 'text-red-300 bg-red-900/40' : 'text-gray-400 bg-gray-800'}`}>{st}</span>
      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ml-1 border ${rvCls}`}>{rv}</span>
      <span data-testid={`node-status-${n.shot_key}`} style={{ display: 'none' }}>{st}</span>
      <div className="mt-2.5 space-y-1 text-[10px]">
        <div data-testid={`canvas-node-status-${n.shot_key}`} className="text-gray-500">状态: <span className="text-gray-300">{st}</span></div>
        <div data-testid={`canvas-node-review-${n.shot_key}`} className={rvCls.replace(/bg-\S+/g, '').trim()}>审核: {rv}</div>
        <div className="text-gray-600">素材: {n.bound_asset_role || '-'}</div>
        <div className="text-gray-700 text-[9px] truncate">来源: {n.bound_asset_source || '-'}</div>
      </div>
    </div>
  );
};
const nodeTypes: NodeTypes = { workbenchNode: WorkbenchCanvasNode };

// Toolbar rendered INSIDE ReactFlow context so useReactFlow hooks work
const CanvasToolbar: React.FC<{ instance: any; noData: boolean }> = ({ instance, noData }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [z, setZ] = useState(1);
  useOnViewportChange({ onChange: ({ zoom }) => setZ(zoom) });
  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1.5 px-3 py-2 bg-[#111827]/90 backdrop-blur border-b border-white/5">
      <div className="flex items-center gap-0.5 bg-[#1e293b] rounded-lg p-0.5">
        <button data-testid="canvas-zoom-out" onClick={() => zoomOut({ duration: 150 })} className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded transition-colors" title="缩小">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <span data-testid="canvas-zoom-percent" className="text-[10px] text-gray-400 w-10 text-center select-none tabular-nums">{Math.round(z * 100)}%</span>
        <button data-testid="canvas-zoom-in" onClick={() => zoomIn({ duration: 150 })} className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded transition-colors" title="放大">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
      <button data-testid="canvas-reset-view" onClick={() => fitView({ duration: 200 })} className="text-gray-500 hover:text-gray-300 hover:bg-white/5 p-1 rounded transition-colors" title="重置视图">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
      {instance && (
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span data-testid="canvas-instance-status" className="text-gray-500">实例: <span className="text-gray-300">{instance.status}</span></span>
          <span data-testid="canvas-instance-review-status" className="text-gray-500">审核: <span className="text-gray-300">{instance.review_status || '-'}</span></span>
          {instance.draft_preview_url && <span data-testid="canvas-draft-preview-url" className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full text-[10px]">{instance.draft_preview_url}</span>}
          {instance.final_video_url && <span data-testid="canvas-final-video-url" className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full text-[10px]">{instance.final_video_url}</span>}
        </div>
      )}
    </div>
  );
};

export const ProductionCanvasView: React.FC<Props> = ({ instance, nodes, onRefresh, onSelectNode, assets, shotBindings }) => {
  const noData = !instance || nodes.length === 0;

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!noData && nodes.length > 0) {
      const rfn: RFNode[] = nodes.map((n, i) => ({
        id: n.shot_key, type: 'workbenchNode',
        position: { x: i * 180, y: 60 },
        data: { item: { ...n, shot_name: n.shot_name || DEFAULT_SHOTS.find(d => d.shot_key === n.shot_key)?.shot_name || n.shot_key }, onSelect: onSelectNode, assets: assets || [], binding: (shotBindings || []).find(b => b.shotKey === n.shot_key) },
      }));
      const rfe: Edge[] = nodes.slice(0, -1).map((n, i) => ({
        id: `e-${n.shot_key}-${nodes[i + 1].shot_key}`, source: n.shot_key, target: nodes[i + 1].shot_key,
        animated: false, style: { stroke: '#374151', strokeWidth: 2 },
      }));
      return { rfNodes: rfn, rfEdges: rfe };
    }
    const rfn: RFNode[] = DEFAULT_SHOTS.map((s, i) => ({
      id: s.shot_key, type: 'workbenchNode',
      position: { x: i * 220, y: 60 },
      data: { item: { ...s, status: 'pending', review_status: '-', bound_asset_role: null, bound_asset_source: null }, onSelect: onSelectNode, assets: assets || [], binding: (shotBindings || []).find(b => b.shotKey === s.shot_key) },
    }));
    const rfe: Edge[] = DEFAULT_SHOTS.slice(0, -1).map((s, i) => ({
      id: `e-${s.shot_key}-${DEFAULT_SHOTS[i + 1].shot_key}`, source: s.shot_key, target: DEFAULT_SHOTS[i + 1].shot_key,
      animated: false, style: { stroke: '#374151', strokeWidth: 2 },
    }));
    return { rfNodes: rfn, rfEdges: rfe };
  }, [nodes, noData, assets, shotBindings]);

  return (
    <div data-testid="production-canvas-view" className="h-full flex flex-col bg-[#0a0f1a] overflow-hidden">
      <ReactFlowProvider>
        <div className="flex-1 min-h-0 relative">
          {noData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 mt-16">
              <Package className="w-10 h-10 text-gray-700 mb-2" />
              <div className="text-sm text-gray-500">请先创建 video batch</div>
              <div className="text-[11px] text-gray-700 mt-1">系统将按 6 个分镜节点生成模拟视频</div>
            </div>
          )}
          <ReactFlow
            nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
            fitView fitViewOptions={{ padding: 0.15, duration: 0 }} minZoom={0.3} maxZoom={2}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={true}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1f2937" gap={16} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
            <CanvasToolbar instance={instance} noData={noData} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </div>
  );
};
