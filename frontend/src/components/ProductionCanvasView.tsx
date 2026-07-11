import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useOnViewportChange,
  addEdge, useNodesState, useEdgesState, BaseEdge, EdgeLabelRenderer, getBezierPath,
  type Node as RFNode, type Edge, type NodeTypes, type EdgeTypes, type Connection, type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Package } from 'lucide-react';
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
  onHoverRefNode?: (nodeId: string | null) => void;
  onDropImageToRefNode?: (nodeId: string, file: File) => void;
  onDropImageToCanvas?: (file: File, canvasPos: { x: number; y: number }) => void;
  refImageUrls?: Record<string, string>;
  freeRefNodes?: { id: string; imageAssetId: string; position: { x: number; y: number } }[];
  imageAssets?: { id: string; name: string; url: string; mimeType: string; createdAt: number; source: string }[];
  onDeleteFreeRefNode?: (nodeId: string) => void;
  // 10D-3: Track canvas mouse position for paste placement
  onCanvasMouseMove?: (pos: { x: number; y: number }) => void;
  // Manual connection support
  manualEdges?: any[];
  onManualEdgeCreate?: (edge: any) => void;
  // Create free node from library ImageAsset by assetId
  onCreateFreeFromLibraryAsset?: (assetId: string, position: { x: number; y: number }) => void;
  // Legacy: create free node from workbench asset
  onManualFreeNodeFromAsset?: (freeId: string, asset: WorkbenchAsset, position: { x: number; y: number }) => void;
  // 10D-4: Clear image / drop asset on reference node
  onClearRefNodeImage?: (nodeId: string) => void;
  onDropAssetToRefNode?: (nodeId: string, assetId: string) => void;
  // 10E: Per-shot reference lists
  shotReferences?: Record<string, any[]>;
  // 10G-2: Optional size reference shot
  optionalShotEnabled?: boolean;
  // 10I: Video asset library
  videoAssetsByShot?: Record<string, any[]>;
  currentVideoByShot?: Record<string, string>;
}

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
const shotNodeTypes: NodeTypes = { referenceImageNode: ReferenceImageNode, shotControlNode: ShotControlNode, fixedVideoResultNode: FixedVideoResultNode, mergeNode: MergeNode };

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

export const ProductionCanvasView: React.FC<Props> = ({ instance, nodes, onRefresh, onSelectNode, assets, shotBindings, onConnectBinding, onDeleteBinding, connectingAssetId, onStartConnecting, onCancelConnecting, onRegenerateShot, onGenerateSingleShot, generatingShotKeys, productLine, onHoverRefNode, onDropImageToRefNode, onDropImageToCanvas, refImageUrls, freeRefNodes, imageAssets, onDeleteFreeRefNode, onCanvasMouseMove, manualEdges, onManualEdgeCreate, onCreateFreeFromLibraryAsset, onManualFreeNodeFromAsset, onClearRefNodeImage, onDropAssetToRefNode, shotReferences, optionalShotEnabled, videoAssetsByShot, currentVideoByShot }) => {
  const noData = !instance || nodes.length === 0;

  // Shot data is sourced from the nodes/shotBindings props; visual nodes are produced by produceFixedLayout below.

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

  // Generate fixed workflow layout nodes and edges (productLine-dependent)
  const fixedLayout = useMemo(() => {
    const raw = produceFixedLayout(productLine || 'desk_calendar', optionalShotEnabled);
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
            hasStartFrame: true, // 10I: always allow mock generate, no startFrame gating
            disabledReason: !nodeId ? '请先生成批次' : '',
            generating: (generatingShotKeys || []).includes(sk),
            connectingAssetId,
            onConnectBinding,
            nodeStatus: nodeItem?.status || 'pending',
            nodeReviewStatus: nodeItem?.review_status || '-',
            shotReferences: (shotReferences || {})[sk] || [],
          };
        }
        if (n.type === 'referenceImageNode') {
          n.data = {
            ...n.data,
            imageUrl: (refImageUrls || {})[n.id] || undefined,
            // Hover tracked via CSS :hover + ref callback; NOT in node data to avoid rebuilds
            onHoverStart: (nodeId: string) => onHoverRefNode?.(nodeId),
            onHoverEnd: () => onHoverRefNode?.(null),
            onDropImage: (nodeId: string, file: File) => onDropImageToRefNode?.(nodeId, file),
            // 10D-4: Clear image / drop asset on fixed reference node
            onClearImage: () => onClearRefNodeImage?.(n.id),
            onDropAsset: (nodeId: string, assetId: string) => onDropAssetToRefNode?.(nodeId, assetId),
          };
        }
        if (n.type === 'fixedVideoResultNode') {
          const sk = n.data.shot_key;
          const currentVideoId = (currentVideoByShot || {})[sk];
          const currentVideo = currentVideoId ? ((videoAssetsByShot || {})[sk] || []).find((v: any) => v.id === currentVideoId) : null;
          n.data = { ...n.data, currentVideo: currentVideo || null, generating: (generatingShotKeys || []).includes(sk), generationProgress: undefined };
        }
        if (n.type === 'mergeNode') {
          const isWall = (productLine || 'desk_calendar') === 'wall_calendar';
          const shotKeys = [...(isWall ? ([] as string[]) : ([] as string[]))];
          // Use the actual shot keys from fixedLayout nodes
          const layoutShotKeys = raw.nodes.filter((rn: any) => rn.type === 'shotControlNode').map((rn: any) => rn.data?.shot_key).filter(Boolean);
          // Compute blocked shots: shots where currentVideo is not approved or doesn't exist
          const blockedShots: { shotKey: string; reason: string }[] = [];
          let approvedCount = 0;
          layoutShotKeys.forEach((sk: string) => {
            const cid = (currentVideoByShot || {})[sk];
            const cv = cid ? ((videoAssetsByShot || {})[sk] || []).find((v: any) => v.id === cid) : null;
            if (cv?.reviewStatus === 'approved') {
              approvedCount++;
            } else {
              let reason = '未通过';
              if (!cv) reason = '未生成';
              else if (cv.reviewStatus === 'pending') reason = '待审核';
              else if (cv.reviewStatus === 'rejected') reason = '已驳回';
              blockedShots.push({ shotKey: sk, reason });
            }
          });
          const allApproved = approvedCount === layoutShotKeys.length;
          const totalCount = layoutShotKeys.length;
          n.data = { ...n.data, canMerge: allApproved, mergeStatus: approvedCount > 0 ? `${approvedCount}/${totalCount} 已通过` : '等待全部分镜审核通过', blockedShots };
        }
        return n;
      }),
      edges: raw.edges,
    };
  }, [productLine, nodes, shotBindings, onSelectNode, onGenerateSingleShot, generatingShotKeys, connectingAssetId, onConnectBinding, onDropImageToRefNode, refImageUrls, onClearRefNodeImage, onDropAssetToRefNode, shotReferences, optionalShotEnabled, videoAssetsByShot, currentVideoByShot]);

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
        isFreeNode: true,
        freeNodeId: frn.id,
        onHoverStart: (nodeId: string) => onHoverRefNode?.(nodeId),
        onHoverEnd: () => onHoverRefNode?.(null),
        onDropImage: (nodeId: string, file: File) => onDropImageToRefNode?.(nodeId, file),
        onDropAsset: (nodeId: string, assetId: string) => onDropAssetToRefNode?.(nodeId, assetId),
        onDeleteFreeNode: () => onDeleteFreeRefNode?.(frn.id),
      },
      draggable: true,
    };
  }), [freeRefNodes, imageAssets, productLine, onHoverRefNode, onDropImageToRefNode, onDeleteFreeRefNode]);

  const allNodes = useMemo(() => [...fixedLayout.nodes, ...freeRefNodesRf], [fixedLayout.nodes, freeRefNodesRf]);
  const allEdges = useMemo(() => [...fixedLayout.edges, ...bindingEdges, ...(manualEdges || [])], [fixedLayout.edges, bindingEdges, manualEdges]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(allNodes);

  // Sync external state into ReactFlow state, preserving dragged positions
  React.useEffect(() => {
    setRfNodes(prev => {
      const prevMap = new Map(prev.map(n => [n.id, n]));
      return allNodes.map(n => {
        const existing = prevMap.get(n.id);
        if (existing) return { ...n, position: existing.position };
        return n;
      });
    });
  }, [allNodes, setRfNodes]);

  // Edges: useEdgesState with allEdges as direct initial value
  const [rfEdgesState, setRfEdges, onEdgesChangeLocal] = useEdgesState(allEdges);
  React.useEffect(() => { setRfEdges(allEdges); }, [allEdges, setRfEdges]);

  const onEdgesChangeWrapper: OnEdgesChange = useCallback((changes) => {
    onEdgesChangeLocal(changes);
  }, [onEdgesChangeLocal]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.target || !connection.source || !connection.targetHandle) return;

    // Path 1: Existing asset-binding handles (start_frame, end_frame, reference_image)
    if (connection.targetHandle.match(/^(start_frame|end_frame|reference_image)$/)) {
      if (!connection.source.startsWith('asset-')) return;
      const targetShotKey = connection.target.startsWith('shot-control-node-') ? connection.target.replace('shot-control-node-', '') : connection.target;
      const assetId = connection.source.replace('asset-', '');
      const bindingType = connection.targetHandle;
      const frameType = bindingType === 'start_frame' ? 'startFrame' : bindingType === 'end_frame' ? 'endFrame' : 'reference';
      onConnectBinding?.(targetShotKey, frameType, assetId);
      return;
    }

    // Path 2: Manual ReferenceImageNode → ShotControlNode connection
    if (connection.sourceHandle === 'source' && connection.targetHandle === 'target') {
      const sourceIsRef = connection.source.startsWith('ref-node-') || connection.source.startsWith('free-ref-');
      const targetIsShot = connection.target.startsWith('shot-control-node-');
      if (!sourceIsRef || !targetIsShot) return;

      const edgeId = `manual-edge-${connection.source}-${connection.target}`;
      // Check for duplicates
      const exists = (manualEdges || []).some(e => e.id === edgeId);
      if (exists) return;

      onManualEdgeCreate?.({
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'default',
        style: { stroke: '#8b5cf6', strokeWidth: 1.6, opacity: 0.7 },
      });
      return;
    }
  }, [onConnectBinding, manualEdges, onManualEdgeCreate]);

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
    // Handle library image-asset drags — hit-test reference nodes first
    try {
      const libRaw = event.dataTransfer.getData('application/workbench-image-asset');
      if (libRaw) {
        const { assetId } = JSON.parse(libRaw);
        const canvasRect = event.currentTarget.getBoundingClientRect();
        const pos = { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top };
        // Hit-test: check if the drop point is over any reference node's bounding box
        const refNodeEls = event.currentTarget.querySelectorAll('[data-testid^="reference-image-node-"]');
        let hitNode: string | null = null;
        for (const el of Array.from(refNodeEls)) {
          const r = el.getBoundingClientRect();
          // Expand hit area by 16px on each side for easier targeting
          if (event.clientX >= r.left - 16 && event.clientX <= r.right + 16 &&
              event.clientY >= r.top - 16 && event.clientY <= r.bottom + 16) {
            hitNode = el.getAttribute('data-node-id');
            break;
          }
        }
        if (hitNode) {
          // Drop over a reference node — replace its image
          onDropAssetToRefNode?.(hitNode, assetId);
        } else {
          // Drop on blank canvas — create free node
          onCreateFreeFromLibraryAsset?.(assetId, pos);
        }
        return;
      }
    } catch {}
    // Legacy: handle old-style workbench asset drops (asset card format)
    try {
      const raw = event.dataTransfer.getData('application/workbench-asset');
      if (!raw) return;
      const data = JSON.parse(raw);
      // If the legacy data has _assetId, use it for assetId-based creation
      if (data._assetId) {
        const canvasRect = event.currentTarget.getBoundingClientRect();
        const pos = { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top };
        onCreateFreeFromLibraryAsset?.(data._assetId, pos);
        return;
      }
      // Otherwise try the old workbench asset path (filename + url)
      const asset = data as WorkbenchAsset;
      const canvasRect = event.currentTarget.getBoundingClientRect();
      const pos = { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top };
      const freeId = `free-ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      onManualFreeNodeFromAsset?.(freeId, asset, pos);
    } catch {}
  }, [setRfNodes, onDropImageToCanvas]);

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

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
    <div data-testid="production-canvas-view" className="h-full flex flex-col bg-[#0a0f1a] overflow-hidden" onDragOver={onDragOver} onDrop={onDrop}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onCanvasMouseMove?.({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}>
      <ReactFlowProvider>
        <div className="flex-1 min-h-0 relative">
          {noData && (<div data-testid="canvas-empty-hint" className="absolute top-2 left-2 flex items-center gap-1.5 z-10"><Package className="w-3 h-3 text-gray-600" /><span className="text-[10px] text-gray-600">请先创建 video batch</span></div>)}
          <ReactFlow nodes={rfNodes} edges={rfEdgesState} nodeTypes={shotNodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChangeWrapper} onConnect={onConnect} onNodeClick={handleNodeClick} fitView fitViewOptions={{ padding: 0.15, duration: 0 }} minZoom={0.3} maxZoom={2} nodesDraggable={true} nodesConnectable={true} elementsSelectable={true} proOptions={{ hideAttribution: true }}>
            <Background color="#1f2937" gap={16} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
            <CanvasToolbar instance={instance} noData={noData} connectingAssetId={connectingAssetId} onCancelConnecting={onCancelConnecting} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </div>
  );
};
