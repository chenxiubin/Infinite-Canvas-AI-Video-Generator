import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/mvp3';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
import { type StoryboardPromptConfig, getDefaultStoryboardConfig, buildFinalPrompt } from '../lib/storyboardPrompt';
import { WorkbenchHeader } from './WorkbenchHeader';
import { WorkflowSidebar } from './WorkflowSidebar';
import { ProductionCanvasView } from './ProductionCanvasView';
import { RightInspectorPanel } from './RightInspectorPanel';
import { ProductionStatusSummary } from './ProductionStatusSummary';

type NodeStatus = 'pending' | 'running' | 'success' | 'failed';
interface NodeItem { node_id: string; shot_key: string; status: NodeStatus; [key: string]: any }
interface InstanceData { instance_id: string; status: string; draft_preview_url?: string; review_status?: string; export_status?: string; final_video_url?: string; nodes?: NodeItem[] }

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; backendAssetId?: string; }
interface ShotFrameBinding { shotKey: string; startFrameAssetId?: string; startFrameBindingId?: string; endFrameAssetId?: string; endFrameBindingId?: string; referenceAssetIds?: string[]; referenceBindingIds?: string[]; }

// 10D-2: Mock image asset — kept in a front-end-only library, separate from WorkbenchAsset
interface ImageAsset { id: string; name: string; url: string; mimeType: string; createdAt: number; source: string; fileName: string; size: number; contentHash: string; }

// 10D-2: Free-standing reference image node (not part of fixed layout)
interface FreeRefNode { id: string; imageAssetId: string; position: { x: number; y: number }; }

export const ProductionWorkbench: React.FC<{ onSwitchToLegacy?: () => void }> = ({ onSwitchToLegacy }) => {
  const [error, setError] = useState(''); const [loading, setLoading] = useState('');
  const [demoLog, setDemoLog] = useState<string[]>([]); const [productId, setProductId] = useState('');
  const [checklist, setChecklist] = useState<any>(null); const [templates, setTemplates] = useState<any[]>([]);
  const [selTemplateId, setSelTemplateId] = useState(''); const [batchId, setBatchId] = useState('');
  const [instance, setInstance] = useState<InstanceData | null>(null); const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [viewMode, setViewMode] = useState<'form' | 'canvas'>('canvas');
  const [modelAdapter, setModelAdapter] = useState('mock'); const [adapters, setAdapters] = useState<any[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = nodes.find(n => n.node_id === selectedNodeId || n.shot_key === selectedNodeId)
    ?? (selectedNodeId ? { node_id: '', shot_key: selectedNodeId, shot_name: selectedNodeId, status: 'pending', review_status: '-' } as any : null);
  const [assets, setAssets] = useState<WorkbenchAsset[]>([]);
  const [shotBindings, setShotBindings] = useState<ShotFrameBinding[]>([]);
  const [connectingAssetId, setConnectingAssetId] = useState<string | null>(null);
  const [storyboardConfigs, setStoryboardConfigs] = useState<Record<string, StoryboardPromptConfig>>({});
  const [motionShotVersion, setMotionShotVersion] = useState<'primary' | 'backup'>('primary');
	const [productLine, setProductLine] = useState<'desk_calendar' | 'wall_calendar'>('desk_calendar');
	const [generatingShotKeys, setGeneratingShotKeys] = useState<string[]>([]);
	// 10D-1: Reference image node interactions — hover target via ref (no re-render)
	const hoveredRefNodeIdRef = useRef<string | null>(null);
	const setHoveredRefNodeId = useCallback((id: string | null) => { hoveredRefNodeIdRef.current = id; }, []);
	const [refImageUrls, setRefImageUrls] = useState<Record<string, string>>({});
	// 10D-2: Mock image asset library + free reference nodes
	const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
	const [freeRefNodes, setFreeRefNodes] = useState<FreeRefNode[]>([]);
	// Manual edges created by user dragging between handles (separate from fixed layout edges)
	const [manualEdges, setManualEdges] = useState<any[]>([]);

  const batchIdRef = useRef(''); const instanceRef = useRef<InstanceData | null>(null);
  useEffect(() => { batchIdRef.current = batchId; }, [batchId]);
  useEffect(() => { instanceRef.current = instance; }, [instance]);

  const showError = (e: any) => setError(e?.message || String(e)); const clearError = () => setError('');
  const addLog = (msg: string) => setDemoLog(prev => [...prev, msg]);
  const loadInstance = useCallback(async (iid: string) => { const inst = await api.getVideoInstance(iid); setInstance(inst); setNodes(inst.nodes || []); }, []);
  const refreshAll = async () => { if (instanceRef.current) { const i = await api.getVideoInstance(instanceRef.current.instance_id); setInstance(i); setNodes(i.nodes || []); } };
  const handleSelectNode = useCallback((n: any) => { setSelectedNodeId(n?.node_id || n?.shot_key || null); }, []);

  useEffect(() => { api.listVideoTemplates().then(d => setTemplates(d.templates || [])).catch(() => {}); api.listModelAdapters().then(d => setAdapters(d.adapters || [])).catch(() => {}); }, []);

  // --- Full Demo ---
  const handleFullDemo = async () => {
    try { clearError(); setDemoLog([]); setLoading('Running demo...');
      addLog('creating product...'); const s = `SKU-DEMO-${Date.now()}`; const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Demo ${s}` });
      const pid = d.product_id; setProductId(pid); addLog('product created');
      for (const r of ['main','detail1','detail2','scene','brand']) { await api.registerAsset(pid, { original_filename:`${s}_${r}.jpg`, file_url:`/mock/${s}_${r}.jpg` }); }
      addLog('assets registered'); const dd = await api.getProduct(pid);
      for (const a of (dd.assets||[])) { if (a.role_key!=='unrecognized') await api.updateAssetRole(pid,a.asset_id,a.role_key); }
      await api.getProduct(pid).then(d => setChecklist(d.checklist||null)); addLog('checklist ready');
      const tId = templates.find(t=>t.product_type==='desk_calendar')?.template_id||(await api.listVideoTemplates('desk_calendar')).templates[0].template_id;
      setSelTemplateId(tId); addLog('template selected');
      const bd = await api.createVideoBatch(tId,[pid]); setBatchId(bd.batch_id); batchIdRef.current=bd.batch_id; addLog('batch created');
      if(bd.instances?.length){const i=await api.getVideoInstance(bd.instances[0].instance_id);setInstance(i);setNodes(i.nodes||[]);}
      await api.generateVideoBatch(bd.batch_id); const fb=await api.getVideoBatch(bd.batch_id);
      if(fb.instances?.length){const fi=await api.getVideoInstance(fb.instances[0].instance_id);setInstance(fi);setNodes(fi.nodes||[]);}
      addLog('generated success');
      await api.reviewInstance(fb.instances[0].instance_id, 'approve');
      const ri = await api.getVideoInstance(fb.instances[0].instance_id);
      setInstance(ri); setNodes(ri.nodes || []); addLog('review approved');
      await api.mergePreview(ri.instance_id);
      const mi = await api.getVideoInstance(ri.instance_id); setInstance(mi); setNodes(mi.nodes || []); addLog('preview generated');
      // Merge resets review_status to pending — re-approve before export
      await api.reviewInstance(mi.instance_id, 'approve');
      const ai = await api.getVideoInstance(mi.instance_id); setInstance(ai); setNodes(ai.nodes || []); addLog('review re-approved');
      await api.exportInstance(ai.instance_id); const ei = await api.getVideoInstance(ai.instance_id); setInstance(ei); setNodes(ei.nodes || []); addLog('mock export completed');
    }catch(e){showError(e);addLog(`ERROR: ${e?.message||e}`);}finally{setLoading('');}
  };
  const handleReset = () => { assets.forEach(a => { if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); }); Object.values(refImageUrls).forEach(u => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u); }); imageAssets.forEach(a => { if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); }); setProductId('');setChecklist(null);setBatchId('');setInstance(null);setNodes([]);setSelTemplateId('');setError('');setDemoLog([]);batchIdRef.current='';instanceRef.current=null;setSelectedNodeId(null);setAssets([]);setShotBindings([]);setConnectingAssetId(null);setStoryboardConfigs({});setMotionShotVersion('primary');setRefImageUrls({});setImageAssets([]);setFreeRefNodes([]); };
  const assetsRef = useRef(assets); assetsRef.current = assets;
  useEffect(() => { return () => { assetsRef.current.forEach(a => { if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); }); }; }, []);

  // --- Handlers ---
  const handleDemoDesk = async () => { try{clearError();const s=`SKU-DEMO-${Date.now()}`;const d=await api.createProduct({product_type:'desk_calendar',sku:s,title:`Demo ${s}`});const p=d.product_id;setProductId(p);for(const r of['main','detail1','detail2','scene','brand']){await api.registerAsset(p,{original_filename:`${s}_${r}.jpg`,file_url:`/mock/${s}_${r}.jpg`});}const dd=await api.getProduct(p);for(const a of(dd.assets||[])){if(a.role_key!=='unrecognized')await api.updateAssetRole(p,a.asset_id,a.role_key);}const fd=await api.getProduct(p);setChecklist(fd.checklist||null);}catch(e){showError(e);} };
  const handleCreateBatch = async () => { if(!productId||!selTemplateId)return;try{clearError();const d=await api.createVideoBatch(selTemplateId,[productId]);setBatchId(d.batch_id);batchIdRef.current=d.batch_id;if(d.instances?.length)await loadInstance(d.instances[0].instance_id);}catch(e){showError(e);} };
  const handleGenerate = async () => { const b=batchIdRef.current;if(!b)return;try{clearError();await api.generateVideoBatch(b);const bd=await api.getVideoBatch(b);if(bd.instances?.length){const fi=await api.getVideoInstance(bd.instances[0].instance_id);setInstance(fi);setNodes(fi.nodes||[]);}}catch(e){showError(e);} };
  const handleMerge = async () => { const i=instanceRef.current;if(!i)return;try{clearError();await api.mergePreview(i.instance_id);await loadInstance(i.instance_id);}catch(e){showError(e);} };
  const handleApproveAll = async () => { const i=instanceRef.current;if(!i)return;try{clearError();await api.reviewInstance(i.instance_id,'approve');await loadInstance(i.instance_id);}catch(e){showError(e);} };
  const handleExport = async () => { const i=instanceRef.current;if(!i)return;try{clearError();await api.exportInstance(i.instance_id);await loadInstance(i.instance_id);}catch(e){showError(e);} };

  const handleUploadAssets = async (files: FileList) => {
    for (const f of Array.from(files)) {
      try {
        const blobUrl = URL.createObjectURL(f);
        const localId = `asset_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        setAssets(prev => [...prev, { id: localId, filename: f.name, url: blobUrl, role: 'reference', createdAt: Date.now() }]);
        const result = await api.uploadAssetFile(f);
        setAssets(prev => prev.map(a => a.id === localId ? { ...a, url: result.url, backendAssetId: result.asset_id } : a));
        URL.revokeObjectURL(blobUrl);
      } catch (e: any) { setError(e?.message || '上传失败'); }
    }
  };
  const handleUpdateAssetRole = (assetId: string, role: string) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, role } : a));
  };
  const handleBindShotFrame = async (shotKey: string, frameType: 'startFrame' | 'endFrame' | 'reference', assetId: string | null) => {
    // Optimistic local state update first (synchronous for UI responsiveness)
    setShotBindings(prev => {
      const existing = prev.find(b => b.shotKey === shotKey);
      if (!existing) {
        const b: ShotFrameBinding = { shotKey };
        if (frameType === 'startFrame') b.startFrameAssetId = assetId || undefined;
        else if (frameType === 'endFrame') b.endFrameAssetId = assetId || undefined;
        else if (frameType === 'reference') b.referenceAssetIds = assetId ? [assetId] : [];
        return [...prev, b];
      }
      return prev.map(b => {
        if (b.shotKey !== shotKey) return b;
        const updated = { ...b };
        if (frameType === 'startFrame') { updated.startFrameAssetId = assetId || undefined; if (!assetId) updated.startFrameBindingId = undefined; }
        else if (frameType === 'endFrame') { updated.endFrameAssetId = assetId || undefined; if (!assetId) updated.endFrameBindingId = undefined; }
        else if (frameType === 'reference') updated.referenceAssetIds = assetId ? [...(b.referenceAssetIds || []), assetId] : [];
        return updated;
      });
    });
    // Persist to backend asynchronously
    const iid = instance?.instance_id;
    if (!iid) return;
    if (!assetId) {
      const b = shotBindings.find(s => s.shotKey === shotKey);
      try {
        if (frameType === 'startFrame' && b?.startFrameBindingId) await api.deleteNodeBinding(iid, shotKey, b.startFrameBindingId);
        else if (frameType === 'endFrame' && b?.endFrameBindingId) await api.deleteNodeBinding(iid, shotKey, b.endFrameBindingId);
      } catch (e: any) { setError(e?.message || '解绑失败'); }
      return;
    }
    const asset = assets.find(a => a.id === assetId);
    const beid = asset?.backendAssetId;
    if (!beid) return;
    try {
      if (frameType === 'startFrame') {
        const r = await api.upsertStartFrameBinding(iid, shotKey, { asset_id: beid, source: 'canvas' });
        setShotBindings(prev => prev.map(b => b.shotKey === shotKey ? { ...b, startFrameBindingId: r.binding_id } : b));
      } else if (frameType === 'endFrame') {
        const r = await api.upsertEndFrameBinding(iid, shotKey, { asset_id: beid, source: 'canvas' });
        setShotBindings(prev => prev.map(b => b.shotKey === shotKey ? { ...b, endFrameBindingId: r.binding_id } : b));
      } else if (frameType === 'reference') {
        const r = await api.addReferenceImageBinding(iid, shotKey, { asset_id: beid, source: 'canvas' });
        setShotBindings(prev => prev.map(b => b.shotKey === shotKey ? { ...b, referenceBindingIds: [...(b.referenceBindingIds || []), r.binding_id] } : b));
      }
    } catch (e: any) { setError(e?.message || '绑定失败'); }
  };
  const handleGenerateSingleShot = async (nodeId: string, shotKey: string) => {
    if (!nodeId) return;
    setGeneratingShotKeys(prev => [...prev, shotKey]);
    try {
      const config = (storyboardConfigs || {})[shotKey] || getDefaultStoryboardConfig(shotKey, productLine, motionShotVersion);
      const prompt = buildFinalPrompt(config);
      const result = await api.generateVideoNode(nodeId, { prompt });
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, status: result.status, video_url: result.video_url, cover_url: result.cover_url } : n));
    } catch (e: any) { setError(e?.message || '生成失败'); }
    finally { setGeneratingShotKeys(prev => prev.filter(k => k !== shotKey)); }
  };
  const handleReviewAction = (shotKey: string, action: string, reason?: string) => {
    if (action === 'approve') {
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, review_status: 'approved', review_reason: '' } : n));
    } else if (action === 'reject') {
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, review_status: 'rejected', review_reason: reason || '' } : n));
    }
  };

  const handleRegenerateShot = async (nodeId: string, shotKey: string) => {
    if (!nodeId) return;
    setGeneratingShotKeys(prev => [...prev, shotKey]);
    try {
      const config = (storyboardConfigs || {})[shotKey] || getDefaultStoryboardConfig(shotKey, productLine, motionShotVersion);
      const prompt = buildFinalPrompt(config);
      // Force regenerate for rejected/failed nodes
      const result = await api.generateVideoNode(nodeId, { prompt, force: true });
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, status: result.status, video_url: result.video_url, cover_url: result.cover_url, review_status: result.status === 'success' ? 'pending' : n.review_status, review_reason: '' } : n));
    } catch (e: any) { setError(e?.message || '重新生成失败'); }
    finally { setGeneratingShotKeys(prev => prev.filter(k => k !== shotKey)); }
  };
  const selectedBinding = shotBindings.find(b => b.shotKey === selectedNode?.shot_key);
  const getBoundAsset = (assetId?: string) => assets.find(a => a.id === assetId);

  const allSuccess = nodes.length>0&&nodes.every(n=>n.status==='success');
  const canExport = instance?.review_status==='approved';
  const isReady = checklist?.is_ready;

  // 10D-3: Unified dedup helper — returns { asset, isNew }
  const imageAssetsRef = useRef(imageAssets);
  imageAssetsRef.current = imageAssets;

  const addImageAssetFromFile = useCallback(async (file: File, source: string): Promise<{ asset: ImageAsset; isNew: boolean }> => {
    const blobUrl = URL.createObjectURL(file);
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const fileName = file.name || `paste-${Date.now()}.png`;

    // Check existing: same fileName + same contentHash = duplicate
    const existing = imageAssetsRef.current.find(a => a.fileName === fileName && a.contentHash === contentHash);
    if (existing) {
      URL.revokeObjectURL(blobUrl);
      return { asset: existing, isNew: false };
    }

    const imgAsset: ImageAsset = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || '未命名图片',
      url: blobUrl,
      mimeType: file.type,
      createdAt: Date.now(),
      source,
      fileName,
      size: file.size,
      contentHash,
    };
    setImageAssets(prev => [...prev, imgAsset]);
    return { asset: imgAsset, isNew: true };
  }, []);

  // 10D-2: Reference image drop handler — adds to library + replaces node image
  const handleDropImageToRefNode = useCallback(async (nodeId: string, file: File) => {
    const { asset } = await addImageAssetFromFile(file, 'drop-reference-node');
    setRefImageUrls(prev => {
      if (prev[nodeId]?.startsWith('blob:')) URL.revokeObjectURL(prev[nodeId]);
      return { ...prev, [nodeId]: asset.url };
    });
  }, [addImageAssetFromFile]);

  // 10D-2: Canvas blank area image drop — adds to library + creates free ReferenceImageNode
  const handleDropImageToCanvas = useCallback(async (file: File, canvasPos: { x: number; y: number }) => {
    const { asset } = await addImageAssetFromFile(file, 'drop-canvas');
    const freeId = `free-ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFreeRefNodes(prev => [...prev, { id: freeId, imageAssetId: asset.id, position: canvasPos }]);
  }, [addImageAssetFromFile]);

  // 10D-2: Delete free reference node (does NOT delete the image from library)
  const handleDeleteFreeRefNode = useCallback((nodeId: string) => {
    setFreeRefNodes(prev => prev.filter(n => n.id !== nodeId));
  }, []);

  // Create free node from library ImageAsset by assetId.
  // Looks up existing ImageAsset directly — no URL matching, no new entries.
  const handleCreateFreeFromLibraryAsset = useCallback((assetId: string, position: { x: number; y: number }) => {
    const existing = imageAssetsRef.current.find(a => a.id === assetId);
    if (!existing) {
      console.warn('[10D-3] Library asset not found:', assetId);
      return;
    }
    const freeId = `free-ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFreeRefNodes(prev => [...prev, { id: freeId, imageAssetId: assetId, position }]);
  }, []);

  // Legacy fallback for old drag format (should rarely be used now)
  const handleManualFreeNodeFromAsset = useCallback((freeId: string, asset: WorkbenchAsset, position: { x: number; y: number }) => {
    // Try to find by _assetId or id first, then fall back to URL
    let existing = imageAssetsRef.current.find(a => a.id === (asset as any)._assetId || a.id === asset.id);
    if (!existing) {
      existing = imageAssetsRef.current.find(a => a.url === asset.url);
    }
    if (!existing) {
      const imgId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      existing = { id: imgId, name: asset.filename, url: asset.url, mimeType: 'image/png', createdAt: Date.now(), source: 'drop-canvas', fileName: asset.filename, size: 0, contentHash: '' };
      setImageAssets(prev => [...prev, existing!]);
    }
    setFreeRefNodes(prev => [...prev, { id: freeId, imageAssetId: existing!.id, position }]);
  }, []);

  // 10D-3: Track last canvas mouse position for paste positioning
  const canvasMousePosRef = useRef<{ x: number; y: number }>({ x: 200, y: 200 });
  const handleCanvasMouseMove = useCallback((pos: { x: number; y: number }) => {
    canvasMousePosRef.current = pos;
  }, []);

  // 10D-3: Create an image asset from a File, optionally targeting a hovered ref node
  const addImageFromFile = useCallback(async (file: File, targetNodeId?: string) => {
    const source = targetNodeId ? 'paste-reference-node' : 'paste-canvas';
    const { asset } = await addImageAssetFromFile(file, source);
    if (targetNodeId) {
      setRefImageUrls(prev => {
        if (prev[targetNodeId]?.startsWith('blob:')) URL.revokeObjectURL(prev[targetNodeId]);
        return { ...prev, [targetNodeId]: asset.url };
      });
    } else {
      const freeId = `free-ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setFreeRefNodes(prev => [...prev, { id: freeId, imageAssetId: asset.id, position: canvasMousePosRef.current }]);
    }
  }, [addImageAssetFromFile]);

  // 10D-3: Ctrl+V paste handler — paste images to hovered ref node or canvas
  const pasteHandlerRef = useRef<(e: ClipboardEvent) => void>(() => {});
  pasteHandlerRef.current = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    // Don't intercept paste in input/textarea/contenteditable
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable)) {
      // Only handle if it contains image data AND no text
      const items = Array.from(e.clipboardData?.items || []);
      const hasText = items.some(i => i.type === 'text/plain' || i.type === 'text/html');
      if (hasText) return; // let normal text paste through
    }
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => ACCEPTED_IMAGE_TYPES.includes(i.type));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) {
        addImageFromFile(file, hoveredRefNodeIdRef.current || undefined).catch(() => {});
      }
    }
  };

  useEffect(() => {
    const handler = (e: ClipboardEvent) => pasteHandlerRef.current(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(refImageUrls).forEach(url => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      imageAssets.forEach(a => {
        if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url);
      });
    };
  }, []);

  return (
    <div data-testid="mvp3-workbench" className="flex flex-col h-screen bg-[#0a0f1a] text-gray-200 font-sans overflow-hidden">
      {/* Header — fixed height */}
      <WorkbenchHeader modelAdapter={modelAdapter} onRunDemo={handleFullDemo} onReset={handleReset} loading={loading} onSwitchToLegacy={onSwitchToLegacy} />

      {/* Status Summary — fixed height */}
      <div className="flex-shrink-0 border-b border-white/5 bg-[#0d1117]">
        <ProductionStatusSummary productId={productId} checklist={checklist} selTemplateId={selTemplateId}
          batchId={batchId} batchStatus={instance?.status||'ready'} nodes={nodes} instance={instance} />
      </div>

      {/* Three-column body — CSS Grid */}
      <div data-testid="workbench-shell" className="grid flex-1 min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
        {/* Left: Workflow Sidebar */}
        <div className="min-h-0 overflow-hidden">
          <WorkflowSidebar
            productId={productId} isReady={isReady} templates={templates} selTemplateId={selTemplateId}
            batchId={batchId} instance={instance} modelAdapter={modelAdapter} adapters={adapters}
            demoLog={demoLog} allSuccess={allSuccess} canExport={canExport} error={error}
            viewMode={viewMode}
            onCreateDemo={handleDemoDesk} onSelectTemplate={setSelTemplateId}
            onCreateBatch={handleCreateBatch} onGenerate={handleGenerate}
            onMerge={handleMerge} onApproveAll={handleApproveAll} onExport={handleExport}
            onSetModelAdapter={setModelAdapter} onSetViewMode={setViewMode} onClearError={clearError}
            assets={assets} onUploadAssets={handleUploadAssets} onUpdateAssetRole={handleUpdateAssetRole}
            onSelectShot={(sk) => setSelectedNodeId(sk)} selectedShotKey={selectedNodeId}
            productLine={productLine} onSetProductLine={setProductLine} motionShotVersion={motionShotVersion}
            nodes={nodes} imageAssets={imageAssets}
          />
        </div>

        {/* Center: Canvas — always visible as main area */}
        <main className="min-w-0 min-h-0 overflow-hidden bg-[#060b14]">
          <ProductionCanvasView instance={instance} nodes={nodes} onRefresh={refreshAll}
            onSelectNode={handleSelectNode}
            assets={assets} shotBindings={shotBindings}
            onConnectBinding={handleBindShotFrame}
            onDeleteBinding={(shotKey, frameType) => handleBindShotFrame(shotKey, frameType as any, null)}
            onRegenerateShot={handleRegenerateShot}
            onGenerateSingleShot={handleGenerateSingleShot}
            generatingShotKeys={generatingShotKeys}
            productLine={productLine}
            connectingAssetId={connectingAssetId}
            onStartConnecting={setConnectingAssetId}
            onCancelConnecting={() => setConnectingAssetId(null)}
            onHoverRefNode={setHoveredRefNodeId}
            onDropImageToRefNode={handleDropImageToRefNode}
            onDropImageToCanvas={handleDropImageToCanvas}
            refImageUrls={refImageUrls}
            freeRefNodes={freeRefNodes}
            imageAssets={imageAssets}
            onDeleteFreeRefNode={handleDeleteFreeRefNode}
            onCanvasMouseMove={handleCanvasMouseMove}
            manualEdges={manualEdges}
            onManualEdgeCreate={(edge: any) => setManualEdges(prev => [...prev, edge])}
            onCreateFreeFromLibraryAsset={handleCreateFreeFromLibraryAsset}
            onManualFreeNodeFromAsset={handleManualFreeNodeFromAsset}
          />
        </main>

        {/* Right: Inspector */}
        <div className="min-h-0 overflow-hidden">
          <RightInspectorPanel node={selectedNode} instanceId={instance?.instance_id||''} onRefresh={refreshAll}
            assets={assets} selectedBinding={selectedBinding} getBoundAsset={getBoundAsset}
            onBindShotFrame={handleBindShotFrame}
            storyboardConfigs={storyboardConfigs} onUpdateStoryboardConfig={(sk, c) => setStoryboardConfigs(prev => ({...prev, [sk]: c}))}
            motionShotVersion={motionShotVersion} onSetMotionShotVersion={setMotionShotVersion}
            onGenerateSingleShot={handleGenerateSingleShot} onRegenerateShot={handleRegenerateShot}
            generatingShotKeys={generatingShotKeys} productLine={productLine}
            onReviewAction={handleReviewAction} />
        </div>
      </div>
    </div>
  );
};
