import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useOnViewportChange,
  Handle, Position, addEdge, useEdgesState, useNodesState, BaseEdge, EdgeLabelRenderer, getBezierPath,
  type Node as RFNode, type Edge, type NodeTypes, type EdgeTypes, type Connection, type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Package } from 'lucide-react';
import { VideoPreviewNode } from './VideoPreviewNode';
import { deriveVideoPreviewNodes } from '../lib/videoPreviewNodes';
import { ReferenceImageNode } from './ReferenceImageNode';
import { ShotControlNode } from './ShotControlNode';
import { FixedVideoResultNode } from './FixedVideoResultNode';
import { MergeNode } from './MergeNode';
import { produceFixedLayout } from '../lib/fixedWorkflowLayout';

interface NodeItem {
  node_id: string; shot_key: string; shot_name: string; shot_order: number;
  duration_seconds: number; required_asset_role: string;
  bound_asset_id?: string; bound_asset_role?: string; bound_asset_source?: string;
  status: string; review_status?: string;
  prompt?: string; video_url?: string; cover_url?: string; error_message?: string;
}

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; backendAssetId?: string; }

interface ShotFrameBinding { shotKey: string; startFrameAssetId?: string; startFrameBindingId?: string; endFrameAssetId?: string; endFrameBindingId?: string; referenceAssetIds?: string[]; referenceBindingIds?: string[]; }

interface Props {
  instance: any; nodes: NodeItem[]; onRefresh: () => void;
  onSelectNode?: (node: NodeItem | null) => void;
  assets?: WorkbenchAsset[]; shotBindings?: ShotFrameBinding[];
  onConnectBinding?: (shotKey: string, frameType: string, assetId: string) => void;
  onDeleteBinding?: (shotKey: string, frameType: string) => void;
  connectingAssetId?: string | null;
  onStartConnecting?: (assetId: string) => void;
  onCancelConnecting?: () => void;
  onRegenerateShot?: (nodeId: string, shotKey: string) => void;
  onGenerateSingleShot?: (nodeId: string, shotKey: string) => void;
  generatingShotKeys?: string[];
  productLine?: 'desk_calendar' | 'wall_calendar';
  // Reference image node interactions (10D-1 / 10D-2)
  hoveredRefNodeId?: string | null;
  onHoverRefNode?: (nodeId: string | null) => void;
  onDropImageToRefNode?: (nodeId: string, file: File) => void;
  onDropImageToCanvas?: (file: File, canvasPos: { x: number; y: number }) => void;
  refImageUrls?: Record<string, string>;
  freeRefNodes?: { id: string; imageAssetId: string; position: { x: number; y: number } }[];
  imageAssets?: { id: string; name: string; url: string; mimeType: string; createdAt: number; source: string }[];
  onDeleteFreeRefNode?: (nodeId: string) => void;
}

const DEFAULT_SHOTS = [
  { shot_key: 'S01_main', shot_name: '主图-正面', shot_order: 1, duration_seconds: 4, required_asset_role: 'main' },
  { shot_key: 'S02_detail1', shot_name: '细节特写-材质', shot_order: 2, duration_seconds: 3, required_asset_role: 'detail1' },
  { shot_key: 'S03_detail2', shot_name: '细节特写-结构', shot_order: 3, duration_seconds: 3, required_asset_role: 'detail2' },
  { shot_key: 'S04_motion', shot_name: '运镜展示', shot_order: 4, duration_seconds: 5, required_asset_role: 'motion' },
  { shot_key: 'S05_scene', shot_name: '场景陈列', shot_order: 5, duration_seconds: 5, required_asset_role: 'scene' },
  { shot_key: 'S06_brand', shot_name: '收尾呼应', shot_order: 6, duration_seconds: 4, required_asset_role: 'brand' },
];

const statusColors: Record<string, string> = { pending: 'border-gray-600/50 bg-[#141a24]', running: 'border-blue-500/50 bg-blue-950/20', success: 'border-green-500/50 bg-green-950/15', failed: 'border-red-500/50 bg-red-950/20' };
const statusDot: Record<string, string> = { pending: 'bg-gray-500', running: 'bg-blue-400 animate-pulse', success: 'bg-green-400', failed: 'bg-red-400' };
const reviewBadge: Record<string, string> = { approved: 'text-green-400 bg-green-900/30 border-green-500/30', rejected: 'text-red-400 bg-red-900/30 border-red-500/30', pending: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30' };

// ==== Custom Node: Shot Node with 3 target Handles ====
const WorkbenchShotNode: React.FC<{ id: string; data: { item: any; onSelect?: (n: any) => void; assets?: WorkbenchAsset[]; binding?: ShotFrameBinding; connectingAssetId?: string | null; onConnectBinding?: (shotKey: string, frameType: string, assetId: string) => void } }> = ({ id, data }) => {
  const n = data.item; const st = n.status || 'pending'; const rv = n.review_status || '-';
  const rvCls = reviewBadge[rv] || 'text-gray-500 bg-gray-800 border-gray-600/20';
  const binding = data.binding; const sfAsset = data.assets?.find(a => a.id === binding?.startFrameAssetId);
  const isConnecting = !!data.connectingAssetId;
  const handleClick = (frameType: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting && data.connectingAssetId) {
      data.onConnectBinding?.(n.shot_key, frameType, data.connectingAssetId);
    }
  };
  return (
    <div data-testid={`canvas-node-${n.shot_key}`} onClick={() => data.onSelect?.(n)}
      className={`cursor-pointer border-2 rounded-xl p-4 w-48 flex-shrink-0 transition-all duration-200 hover:border-white/20 hover:shadow-md ${isConnecting ? 'border-purple-400/50 ring-2 ring-purple-500/20' : statusColors[st] || statusColors.pending}`}>
      <Handle type="target" position={Position.Left} id="start_frame" data-testid={`shot-node-start-frame-handle-${n.shot_key}`} style={{ top: '20%', background: isConnecting ? '#22c55e' : '#22c55e', width: isConnecting ? 18 : 10, height: isConnecting ? 18 : 10 }} title="首帧图" />
      <Handle type="target" position={Position.Left} id="end_frame" data-testid={`shot-node-end-frame-handle-${n.shot_key}`} style={{ top: '50%', background: isConnecting ? '#3b82f6' : '#3b82f6', width: isConnecting ? 18 : 10, height: isConnecting ? 18 : 10 }} title="尾帧图" />
      <Handle type="target" position={Position.Left} id="reference_image" data-testid={`shot-node-reference-image-handle-${n.shot_key}`} style={{ top: '80%', background: isConnecting ? '#eab308' : '#eab308', width: isConnecting ? 18 : 10, height: isConnecting ? 18 : 10 }} title="参考图" />
      {isConnecting && (
        <div className="flex gap-1 mt-1">
          <button data-testid={`shot-node-click-start-frame-${n.shot_key}`} onClick={handleClick('startFrame')} className="flex-1 text-[8px] bg-green-900/50 hover:bg-green-700 text-green-300 rounded px-1 py-0.5 border border-green-500/40">首帧</button>
          <button data-testid={`shot-node-click-end-frame-${n.shot_key}`} onClick={handleClick('endFrame')} className="flex-1 text-[8px] bg-blue-900/50 hover:bg-blue-700 text-blue-300 rounded px-1 py-0.5 border border-blue-500/40">尾帧</button>
          <button data-testid={`shot-node-click-reference-${n.shot_key}`} onClick={handleClick('reference')} className="flex-1 text-[8px] bg-yellow-900/50 hover:bg-yellow-700 text-yellow-300 rounded px-1 py-0.5 border border-yellow-500/40">参考</button>
        </div>
      )}
      <div className="flex items-center gap-2 mb-2"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[st] || 'bg-gray-500'}`} /><span className="node-title text-xs font-semibold text-gray-100 truncate">{n.shot_name}</span></div>
      <div className="text-[10px] text-gray-500 mb-1">{n.shot_key}</div>
      {sfAsset ? (<div className="mb-2 rounded-lg overflow-hidden border border-white/10"><img src={sfAsset.url} alt="首帧" className="w-full h-16 object-cover" /><div className="text-[8px] text-green-400 bg-green-900/30 px-1.5 py-0.5 text-center">首帧已绑定</div></div>) : (<div className="mb-2 rounded-lg border border-dashed border-amber-700/40 bg-amber-900/10 h-16 flex items-center justify-center"><span className="text-[9px] text-amber-500">缺少首帧</span></div>)}
      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ${st==='success'?'text-green-300 bg-green-900/40':st==='running'?'text-blue-300 bg-blue-900/40':st==='failed'?'text-red-300 bg-red-900/40':'text-gray-400 bg-gray-800'}`}>{st}</span>
      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium ml-1 border ${rvCls}`}>{rv}</span>
      <span data-testid={`node-status-${n.shot_key}`} style={{display:'none'}}>{st}</span>
      {n.is_prompt_customized && <div className="text-[7px] text-amber-400 mt-1">已自定义</div>}
      {n.safety_suffix_enabled !== false && <div className="text-[7px] text-gray-500">安全约束</div>}
      <div className="text-[8px] text-gray-600 truncate">{n.camera_move || ''}{n.motion_intensity ? ' · ' + n.motion_intensity : ''}</div>
      <div className="mt-2.5 space-y-1 text-[10px]"><div data-testid={`canvas-node-status-${n.shot_key}`} className="text-gray-500">状态: <span className="text-gray-300">{st}</span></div><div data-testid={`canvas-node-review-${n.shot_key}`}>审核: {rv}</div><div className="text-gray-600">素材: {n.bound_asset_role||'-'}</div><div className="text-gray-700 text-[9px] truncate">来源: {n.bound_asset_source||'-'}</div></div>
    </div>
  );
};

// ==== Custom Node: Asset Node with source Handle ====
const WorkbenchAssetNode: React.FC<{ id: string; data: { asset: WorkbenchAsset; connectingAssetId?: string | null; onStartConnecting?: (id: string) => void; } }> = ({ id, data }) => {
  const a = data.asset; const isConnecting = data.connectingAssetId === a.id;
  return (
    <div data-testid={`canvas-asset-node-${a.id}`} className={`bg-[#111827] border rounded-xl p-3 w-36 ${isConnecting ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-white/10'}`}>
      <Handle type="source" position={Position.Right} id="asset-source" data-testid={`asset-node-source-handle-${a.id}`} style={{ background: '#a855f7', width: 10, height: 10 }} title="连线到分镜" />
      <img src={a.url} data-testid={`canvas-asset-node-thumbnail-${a.id}`} className="w-full h-20 object-cover rounded-lg mb-2 border border-white/5" />
      <div className="text-[10px] text-gray-300 truncate">{a.filename}</div>
      <div className="text-[8px] text-purple-400 mt-0.5">{a.role}</div>
      {isConnecting ? (
        <div className="text-[9px] text-purple-300 text-center mt-1 animate-pulse">连接中...</div>
      ) : (
        <button data-testid={`asset-node-connect-${a.id}`} onClick={(e) => { e.stopPropagation(); data.onStartConnecting?.(a.id); }}
          className="w-full mt-1.5 text-[9px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded py-0.5 border border-purple-500/20 transition-colors">
          连接
        </button>
      )}
    </div>
  );
};

// ==== Custom Edge: MaterialEdge with color/label by binding_type ====
const MaterialEdge: React.FC<{ id: string; sourceX: number; sourceY: number; targetX: number; targetY: number; sourcePosition: any; targetPosition: any; data?: { bindingType?: string; label?: string; onDelete?: (edgeId: string) => void } }> =
  ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const bt = data?.bindingType || 'default';
    const colors: Record<string, string> = { start_frame: '#22c55e', end_frame: '#3b82f6', reference_image: '#eab308', default: '#374151' };
    const labels: Record<string, string> = { start_frame: '首帧', end_frame: '尾帧', reference_image: '参考图', default: '' };
    return (<>
      <BaseEdge id={id} path={edgePath} style={{ stroke: colors[bt] || colors.default, strokeWidth: 2, strokeDasharray: bt === 'reference_image' ? '5,5' : 'none' }} />
      {labels[bt] && (<EdgeLabelRenderer><div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, fontSize: 9, background: '#0a0f1a', padding: '1px 4px', borderRadius: 4, pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 2 }} className="text-gray-300"><span>{labels[bt]}</span><button data-testid={`edge-delete-${id}`} onClick={(e) => { e.stopPropagation(); data?.onDelete?.(id); }} style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: '#ef4444', fontSize: 10, lineHeight: 1, padding: 0 }} title="解绑">x</button></div></EdgeLabelRenderer>)}
    </>);
  };

const edgeTypes: EdgeTypes = { materialEdge: MaterialEdge };
const shotNodeTypes: NodeTypes = { workbenchShot: WorkbenchShotNode, workbenchAsset: WorkbenchAssetNode, workbenchVideoPreview: VideoPreviewNode, referenceImageNode: ReferenceImageNode, shotControlNode: ShotControlNode, fixedVideoResultNode: FixedVideoResultNode, mergeNode: MergeNode };

// ==== Toolbar inside ReactFlow ====
const CanvasToolbar: React.FC<{ instance: any; noData: boolean; connectingAssetId?: string | null; onCancelConnecting?: () => void }> = ({ instance, noData, connectingAssetId, onCancelConnecting }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [z, setZ] = useState(1);
  useOnViewportChange({ onChange: ({ zoom }) => setZ(zoom) });
  return (<div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1.5 px-3 py-2 bg-[#111827]/90 backdrop-blur border-b border-white/5">
    <div className="flex items-center gap-0.5 bg-[#1e293b] rounded-lg p-0.5">
      <button data-testid="canvas-zoom-out" onClick={()=>zoomOut({duration:150})} className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded transition-colors" title="缩小"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/></svg></button>
      <span data-testid="canvas-zoom-percent" className="text-[10px] text-gray-400 w-10 text-center select-none tabular-nums">{Math.round(z*100)}%</span>
      <button data-testid="canvas-zoom-in" onClick={()=>zoomIn({duration:150})} className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded transition-colors" title="放大"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg></button>
    </div>
    <button data-testid="canvas-reset-view" onClick={()=>fitView({duration:200})} className="text-gray-500 hover:text-gray-300 hover:bg-white/5 p-1 rounded transition-colors" title="重置视图"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>
    {connectingAssetId && (<button data-testid="cancel-asset-connection" onClick={onCancelConnecting} className="text-orange-400 hover:text-orange-300 text-[10px] px-2 py-0.5 rounded bg-orange-900/20 border border-orange-500/20">取消连接</button>)}
    {instance && (<div className="ml-auto flex items-center gap-3 text-[10px]"><span data-testid="canvas-instance-status" className="text-gray-500">实例: <span className="text-gray-300">{instance.status}</span></span><span data-testid="canvas-instance-review-status" className="text-gray-500">审核: <span className="text-gray-300">{instance.review_status||'-'}</span></span>{instance.draft_preview_url && <span data-testid="canvas-draft-preview-url" className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full text-[10px]">{instance.draft_preview_url}</span>}{instance.final_video_url && <span data-testid="canvas-final-video-url" className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full text-[10px]">{instance.final_video_url}</span>}</div>)}
  </div>);
};

export const ProductionCanvasView: React.FC<Props> = ({ instance, nodes, onRefresh, onSelectNode, assets, shotBindings, onConnectBinding, onDeleteBinding, connectingAssetId, onStartConnecting, onCancelConnecting, onRegenerateShot, onGenerateSingleShot, generatingShotKeys, productLine, hoveredRefNodeId, onHoverRefNode, onDropImageToRefNode, onDropImageToCanvas, refImageUrls, freeRefNodes, imageAssets, onDeleteFreeRefNode }) => {
  const noData = !instance || nodes.length === 0;

  // Shot data is sourced from the nodes/shotBindings props; visual nodes are produced by produceFixedLayout below.

  // Build asset nodes
  const assetNodes: RFNode[] = useMemo(() => (assets || []).map((a, i) => ({ id: `asset-${a.id}`, type: 'workbenchAsset', position: { x: 20, y: 920 + i * 130 }, data: { asset: a, connectingAssetId, onStartConnecting }, draggable: true })), [assets, connectingAssetId, onStartConnecting]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    if (edgeId.startsWith('be-sf-')) { const sk = edgeId.replace('be-sf-', ''); onDeleteBinding?.(sk, 'startFrame'); }
    else if (edgeId.startsWith('be-ef-')) { const sk = edgeId.replace('be-ef-', ''); onDeleteBinding?.(sk, 'endFrame'); }
    else if (edgeId.startsWith('be-ref-')) { const parts = edgeId.replace('be-ref-', '').split('-'); onDeleteBinding?.(parts[0], 'reference'); }
  }, [onDeleteBinding]);

  // Build binding edges from shotBindings — target the ShotControlNode in fixed layout
  const bindingEdges: Edge[] = useMemo(() => {
    const es: Edge[] = [];
    (shotBindings || []).forEach(b => {
      const targetId = `shot-control-node-${b.shotKey}`;
      if (b.startFrameAssetId) es.push({ id: `be-sf-${b.shotKey}`, source: `asset-${b.startFrameAssetId}`, target: targetId, targetHandle: 'start_frame', type: 'materialEdge', data: { bindingType: 'start_frame', label: '首帧', bindingId: b.startFrameBindingId, onDelete: handleEdgeDelete } });
      if (b.endFrameAssetId) es.push({ id: `be-ef-${b.shotKey}`, source: `asset-${b.endFrameAssetId}`, target: targetId, targetHandle: 'end_frame', type: 'materialEdge', data: { bindingType: 'end_frame', label: '尾帧', bindingId: b.endFrameBindingId, onDelete: handleEdgeDelete } });
      (b.referenceAssetIds || []).forEach((aid, idx) => { es.push({ id: `be-ref-${b.shotKey}-${idx}`, source: `asset-${aid}`, target: targetId, targetHandle: 'reference_image', type: 'materialEdge', data: { bindingType: 'reference_image', label: '参考图', bindingId: (b.referenceBindingIds || [])[idx], onDelete: handleEdgeDelete } }); });
    });
    return es;
  }, [shotBindings, handleEdgeDelete]);

  // Derive video preview nodes from shot nodes that have video_url
  const videoPreviewResult = useMemo(() => {
    const shots = (nodes.length > 0 ? nodes : DEFAULT_SHOTS.map(s => ({ ...s, status: 'pending', review_status: '-', video_url: undefined })));
    const positions: Record<string, { x: number; y: number }> = {};
    shots.forEach((s, i) => { positions[s.shot_key] = { x: i * 200, y: 60 }; });
    const raw = deriveVideoPreviewNodes(shots as any, positions);
    return {
      nodes: raw.nodes.map(n => ({
        ...n,
        data: { ...n.data, onRegenerate: (d: any) => {
          const node = nodes.find(nn => nn.shot_key === d.shot_key);
          if (node?.node_id) onRegenerateShot?.(node.node_id, d.shot_key);
        }},
      })),
      edges: raw.edges,
    };
  }, [nodes, onRegenerateShot]);
  const videoPreviewNodes = videoPreviewResult.nodes;
  const videoPreviewEdges = videoPreviewResult.edges;

  // Generate fixed workflow layout nodes and edges (productLine-dependent)
  const fixedLayout = useMemo(() => {
    const raw = produceFixedLayout(productLine || 'desk_calendar');
    return {
      nodes: raw.nodes.map(n => {
        if (n.type === 'shotControlNode') {
          const sk = n.data.shot_key;
          const nodeItem = nodes.find(nn => nn.shot_key === sk);
          const binding = (shotBindings || []).find(b => b.shotKey === sk);
          const hasStartFrame = !!binding?.startFrameAssetId;
          const nodeId = nodeItem?.node_id || '';
          const disabledReason = !nodeId ? '请先生成批次' : !hasStartFrame ? '缺少首帧' : '';
          n.data = {
            ...n.data,
            onSelectShot: (skSel: string) => { const node = nodes.find(nn => nn.shot_key === skSel); if (node) onSelectNode?.(node); else onSelectNode?.({ shot_key: skSel, shot_name: skSel, status: 'pending' } as any); },
            onGenerate: (nid: string, shotKey: string) => onGenerateSingleShot?.(nid, shotKey),
            nodeId,
            hasStartFrame,
            disabledReason,
            generating: (generatingShotKeys || []).includes(sk),
            connectingAssetId,
            onConnectBinding,
            nodeStatus: nodeItem?.status || 'pending',
            nodeReviewStatus: nodeItem?.review_status || '-',
          };
        }
        if (n.type === 'referenceImageNode') {
          n.data = {
            ...n.data,
            imageUrl: (refImageUrls || {})[n.id] || undefined,
            isHovered: hoveredRefNodeId === n.id,
            onHoverStart: (nodeId: string) => onHoverRefNode?.(nodeId),
            onHoverEnd: () => onHoverRefNode?.(null),
            onDropImage: (nodeId: string, file: File) => onDropImageToRefNode?.(nodeId, file),
          };
        }
        return n;
      }),
      edges: raw.edges,
    };
  }, [productLine, nodes, shotBindings, onSelectNode, onGenerateSingleShot, generatingShotKeys, connectingAssetId, onConnectBinding, hoveredRefNodeId, onHoverRefNode, onDropImageToRefNode, refImageUrls]);

  // 10D-2: Build free reference nodes (dropped on canvas blank area)
  const freeRefNodesRf: RFNode[] = useMemo(() => (freeRefNodes || []).map(frn => {
    const imgAsset = (imageAssets || []).find(a => a.id === frn.imageAssetId);
    return {
      id: frn.id,
      type: 'referenceImageNode',
      position: frn.position,
      data: {
        shot_key: '', shot_name: '自由参考图', ref_index: -1,
        role_label: imgAsset?.name || '未命名',
        product_line: productLine || 'desk_calendar',
        imageUrl: imgAsset?.url,
        isHovered: hoveredRefNodeId === frn.id,
        isFreeNode: true,
        freeNodeId: frn.id,
        onHoverStart: (nodeId: string) => onHoverRefNode?.(nodeId),
        onHoverEnd: () => onHoverRefNode?.(null),
        onDropImage: (nodeId: string, file: File) => onDropImageToRefNode?.(nodeId, file),
        onDeleteFreeNode: () => onDeleteFreeRefNode?.(frn.id),
      },
      draggable: true,
    };
  }), [freeRefNodes, imageAssets, productLine, hoveredRefNodeId, onHoverRefNode, onDropImageToRefNode, onDeleteFreeRefNode]);

  const allNodes = useMemo(() => [...fixedLayout.nodes, ...assetNodes, ...videoPreviewNodes, ...freeRefNodesRf], [fixedLayout.nodes, assetNodes, videoPreviewNodes, freeRefNodesRf]);
  const allEdges = useMemo(() => [...fixedLayout.edges, ...bindingEdges, ...videoPreviewEdges], [fixedLayout.edges, bindingEdges, videoPreviewEdges]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(allNodes);
  const [rfEdges, setRfEdges, onEdgesChangeLocal] = useEdgesState(allEdges);

  // Sync external state into ReactFlow state
  React.useEffect(() => { setRfNodes(allNodes); }, [allNodes, setRfNodes]);
  React.useEffect(() => { setRfEdges(allEdges); }, [allEdges, setRfEdges]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.target || !connection.source || !connection.targetHandle) return;
    if (!connection.targetHandle.match(/^(start_frame|end_frame|reference_image)$/)) return;
    if (!connection.source.startsWith('asset-')) return;
    const targetShotKey = connection.target.startsWith('shot-control-node-') ? connection.target.replace('shot-control-node-', '') : connection.target;
    const assetId = connection.source.replace('asset-', '');
    const bindingType = connection.targetHandle; // 'start_frame'|'end_frame'|'reference_image'
    // Map handle id to frameType: 'start_frame'→'startFrame', 'end_frame'→'endFrame', 'reference_image'→'reference'
    const frameType = bindingType === 'start_frame' ? 'startFrame' : bindingType === 'end_frame' ? 'endFrame' : 'reference';
    onConnectBinding?.(targetShotKey, frameType, assetId);
  }, [onConnectBinding]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // 10D-1: Handle raw image files dropped on canvas blank area
    const imageFiles = Array.from(event.dataTransfer.files || []).filter(
      f => ['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)
    );
    if (imageFiles.length > 0) {
      const canvasRect = event.currentTarget.getBoundingClientRect();
      const canvasPos = { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top };
      imageFiles.forEach(f => onDropImageToCanvas?.(f, canvasPos));
      return;
    }
    // Existing: handle workbench asset drops
    try {
      const raw = event.dataTransfer.getData('application/workbench-asset');
      if (!raw) return;
      const asset = JSON.parse(raw) as WorkbenchAsset;
      const pos = { x: event.clientX - 350, y: event.clientY - 150 };
      setRfNodes(nds => {
        if (nds.find(n => n.id === `asset-${asset.id}`)) return nds;
        return [...nds, { id: `asset-${asset.id}`, type: 'workbenchAsset', position: pos, data: { asset }, draggable: true }];
      });
    } catch {}
  }, [setRfNodes, onDropImageToCanvas]);

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const onEdgesChangeWrapper: OnEdgesChange = useCallback((changes) => {
    onEdgesChangeLocal(changes);
  }, [onEdgesChangeLocal]);

  // React Flow onNodeClick — the proper API for canvas node clicks.
  const handleNodeClick = useCallback((_event: React.MouseEvent, rfNode: any) => {
    if (rfNode.type === 'shotControlNode' && rfNode.data?.shot_key) {
      const sk: string = rfNode.data.shot_key;
      const nodeItem = nodes.find(nn => nn.shot_key === sk);
      if (nodeItem) {
        onSelectNode?.(nodeItem);
      } else {
        onSelectNode?.({ shot_key: sk, shot_name: sk, status: 'pending' } as any);
      }
    }
    // 10D-2: Clicking a free reference node selects it in Inspector
    if (rfNode.type === 'referenceImageNode' && rfNode.data?.isFreeNode) {
      const imgAsset = (imageAssets || []).find(a => a.id === rfNode.data?.imageAssetId);
      onSelectNode?.({
        node_id: rfNode.id, shot_key: rfNode.id,
        shot_name: imgAsset?.name || '自由参考图',
        status: 'ready', review_status: '-',
        // Attach free-node metadata for Inspector display
        _freeNodeId: rfNode.id,
        _freeNodeImageUrl: rfNode.data?.imageUrl,
      } as any);
    }
  }, [nodes, onSelectNode, imageAssets]);

  return (
    <div data-testid="production-canvas-view" className="h-full flex flex-col bg-[#0a0f1a] overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlowProvider>
        <div className="flex-1 min-h-0 relative">
          {noData && (<div data-testid="canvas-empty-hint" className="absolute top-2 left-2 flex items-center gap-1.5 z-10"><Package className="w-3 h-3 text-gray-600" /><span className="text-[10px] text-gray-600">请先创建 video batch</span></div>)}
          <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={shotNodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChangeWrapper} onConnect={onConnect} onNodeClick={handleNodeClick} fitView fitViewOptions={{ padding: 0.15, duration: 0 }} minZoom={0.3} maxZoom={2} nodesDraggable={true} nodesConnectable={true} elementsSelectable={true} proOptions={{ hideAttribution: true }}>
            <Background color="#1f2937" gap={16} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
            <CanvasToolbar instance={instance} noData={noData} connectingAssetId={connectingAssetId} onCancelConnecting={onCancelConnecting} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </div>
  );
};
