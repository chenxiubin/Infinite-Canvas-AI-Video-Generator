import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/mvp3';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
import { type StoryboardPromptConfig, getDefaultStoryboardConfig, buildFinalPrompt } from '../lib/storyboardPrompt';
import { WorkbenchHeader } from './WorkbenchHeader';
import { WorkflowSidebar } from './WorkflowSidebar';
import { ProductionCanvasView } from './ProductionCanvasView';
import { SHOT_KEYS_DESK, SHOT_KEYS_WALL, REF_COUNTS_DESK, REF_COUNTS_WALL } from '../lib/fixedWorkflowLayout';
import { RightInspectorPanel } from './RightInspectorPanel';
import { ProductionStatusSummary } from './ProductionStatusSummary';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { type UserModelSettings } from '../types/modelSettings';
import { loadUserModelSettings, saveUserModelSettings } from '../lib/userModelSettingsStore';
import { getBuiltinVideoModels, findModelById } from '../lib/apimartClient';
import { uploadImageToApimart, submitApimartVideoGeneration, pollApimartTask, buildApimartVideoRequest, sanitizeError, type VideoGenerationTaskState, type ApimartUploadedImage } from '../lib/apimartGenerationClient';
// import removed: compositionOrder now uses store via prop chain (11A-Fix cleanup)

type NodeStatus = 'pending' | 'running' | 'success' | 'failed';
interface NodeItem { node_id: string; shot_key: string; status: NodeStatus; [key: string]: any }
interface InstanceData { instance_id: string; status: string; draft_preview_url?: string; review_status?: string; export_status?: string; final_video_url?: string; nodes?: NodeItem[] }

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; backendAssetId?: string; }
interface ShotFrameBinding { shotKey: string; startFrameAssetId?: string; startFrameBindingId?: string; endFrameAssetId?: string; endFrameBindingId?: string; referenceAssetIds?: string[]; referenceBindingIds?: string[]; }

// 10D-2: Mock image asset — kept in a front-end-only library, separate from WorkbenchAsset
interface ImageAsset { id: string; name: string; url: string; mimeType: string; createdAt: number; source: string; fileName: string; size: number; contentHash: string; remoteUrls?: { apimart?: { url: string; uploadedAt: number; filename?: string; contentType?: string; bytes?: number } } }

// 10D-2: Free-standing reference image node (not part of fixed layout)
interface FreeRefNode { id: string; imageAssetId: string; position: { x: number; y: number }; }

// 10I: Video asset version — stored in front-end mock library
interface VideoAssetVersion { id: string; shotKey: string; shotTitle: string; productLine: string; videoUrl: string; thumbnailUrl?: string; createdAt: number; versionLabel: string; reviewStatus: 'pending'|'approved'|'rejected'; rejectReason?: string; source: 'single-generate'|'apimart-generate'|'history-restore'; provider?: 'mock' | 'apimart'; model?: string; reviewReason?: string; reviewedAt?: number; }

// 10E: Per-shot reference image list derived from canvas connections
interface ShotReferenceItem {
  id: string; sourceNodeId: string; imageAssetId?: string; imageUrl?: string;
  fileName?: string; kind: 'fixed' | 'free'; status: 'ready' | 'missing'; order: number;
}

export const ProductionWorkbench: React.FC = () => {
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
  // 10G-2: Optional size reference shot + per-shot batch counts
  const [optionalShotEnabled, setOptionalShotEnabled] = useState(false);
  const [shotBatchCounts, setShotBatchCounts] = useState<Record<string, number>>({});
  // 10I: Video asset library
  const [videoAssetsByShot, setVideoAssetsByShot] = useState<Record<string, VideoAssetVersion[]>>({});
  const [currentVideoByShot, setCurrentVideoByShot] = useState<Record<string, string>>({});
  const instanceId = instance?.instance_id || '';
  // 11A-Fix: compositionOrder now managed by useCompositionState hook in child components.
  // ProductionWorkbench only passes through as props — no direct store access.
  const [compositionOrder, setCompositionOrder] = useState<string[]>([]);
  const handleSaveCompositionOrder = useCallback((order: string[]) => {
    setCompositionOrder(order);
  }, []);
  // 10K-1: Model settings
  const [userModelSettings, setUserModelSettings] = useState<UserModelSettings>(loadUserModelSettings);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  // 10K-1: Look up Chinese model name for header display
  const builtinVideoModels = getBuiltinVideoModels();
  const selectedModelInfo = findModelById(builtinVideoModels, userModelSettings.selectedVideoModelId);
  const selectedModelDisplayName = selectedModelInfo?.name || userModelSettings.selectedVideoModelId;
  const modelSettingsLabel =
    userModelSettings.provider === 'mock' ? 'Mock 演示' :
    userModelSettings.apimartApiKey ? `APIMart · ${selectedModelDisplayName}` : 'APIMart · 未配置 Key';
  const handleModelSettingsChanged = useCallback((s: UserModelSettings) => {
    setUserModelSettings(s);
    saveUserModelSettings(s);
  }, []);
  const handleSetProductLine = useCallback((pl: 'desk_calendar' | 'wall_calendar') => {
    if (pl === productLine) return;
    setProductLine(pl);
    setOptionalShotEnabled(false);
    const newKeys = pl === 'wall_calendar' ? SHOT_KEYS_WALL : SHOT_KEYS_DESK;
    const validTargets = new Set(newKeys.map(sk => `shot-control-node-${sk}`));
    setManualEdges(prev => prev.filter(e => validTargets.has(e.target)));
    setShotReferenceOrders(prev => {
      const next: Record<string, string[]> = {};
      newKeys.forEach(sk => { if (prev[sk]) next[sk] = prev[sk]; });
      return next;
    });
    setRefImageUrls(prev => { Object.values(prev).forEach(url => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); }); return {}; });
    setSelectedNodeId(newKeys[0]);
  }, [productLine]);
  const [generatingShotKeys, setGeneratingShotKeys] = useState<string[]>([]);
  // 10K-2: APIMart generation tasks per shot
  const [videoGenerationTasks, setVideoGenerationTasks] = useState<Record<string, VideoGenerationTaskState>>({});
  // 10K-1: Payload summary for E2E (no apiKey)
  const [lastGenerateSummary, setLastGenerateSummary] = useState<string>('');
	// 10D-1: Reference image node interactions — hover target via ref (no re-render)
	const hoveredRefNodeIdRef = useRef<string | null>(null);
	const setHoveredRefNodeId = useCallback((id: string | null) => { hoveredRefNodeIdRef.current = id; }, []);
	const [refImageUrls, setRefImageUrls] = useState<Record<string, string>>({});
	// 10D-2: Mock image asset library + free reference nodes
	const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
	const [freeRefNodes, setFreeRefNodes] = useState<FreeRefNode[]>([]);
	// Manual edges created by user dragging between handles (separate from fixed layout edges)
	const [manualEdges, setManualEdges] = useState<any[]>([]);
	// 10F: Per-shot reference ordering (sourceNodeId array)
	const [shotReferenceOrders, setShotReferenceOrders] = useState<Record<string, string[]>>({});

  // 10E: Derive per-shot reference lists from fixed + manual edges, 10F applies ordering
  // 10G: Use productLine-dependent shot keys and ref counts
  const shotReferences = React.useMemo<Record<string, ShotReferenceItem[]>>(() => {
    const result: Record<string, ShotReferenceItem[]> = {};
    const isWall = productLine === 'wall_calendar';
    const SHOT_KEYS = [
      ...(isWall ? SHOT_KEYS_WALL : SHOT_KEYS_DESK),
      ...(optionalShotEnabled ? (isWall ? ['W08_size_ref'] : ['S07_size_ref']) : []),
    ];
    const REF_COUNTS: Record<string,number> = {
      ...(isWall ? REF_COUNTS_WALL : REF_COUNTS_DESK),
      ...(optionalShotEnabled ? (isWall ? {W08_size_ref:1} : {S07_size_ref:1}) : {}),
    };
    // Fixed ref nodes → their target shots (from fixedWorkflowLayout edges)
    SHOT_KEYS.forEach(sk => {
      result[sk] = [];
      const refCount = REF_COUNTS[sk] || 1;
      for (let ri = 0; ri < refCount; ri++) {
        const nodeId = `ref-node-${sk}-${ri}`;
        const url = refImageUrls[nodeId];
        result[sk].push({
          id: `fixed-${sk}-${ri}`, sourceNodeId: nodeId,
          imageUrl: url || undefined, fileName: url ? `固定参考图 ${ri+1}` : undefined,
          kind: 'fixed', status: url ? 'ready' : 'missing', order: ri,
        });
      }
    });
    // Free reference nodes → their target shots (from manualEdges)
    manualEdges.forEach((edge, ei) => {
      const targetShotKey = edge.target?.startsWith('shot-control-node-') ? edge.target.replace('shot-control-node-', '') : null;
      if (!targetShotKey || !result[targetShotKey]) return;
      const frn = freeRefNodes.find(f => f.id === edge.source);
      if (!frn) return;
      const asset = imageAssets.find(a => a.id === frn.imageAssetId);
      result[targetShotKey].push({
        id: `free-${frn.id}`, sourceNodeId: frn.id,
        imageAssetId: frn.imageAssetId, imageUrl: asset?.url, fileName: asset?.name || asset?.fileName,
        kind: 'free', status: asset?.url ? 'ready' : 'missing',
        order: (REF_COUNTS[targetShotKey] || 1) + ei,
      });
    });
    // 10F: Apply per-shot ordering, then clean orders of stale ids
    Object.keys(result).forEach(sk => {
      const order = shotReferenceOrders[sk];
      if (order && order.length > 0) {
        const idSet = new Set(result[sk].map(r => r.sourceNodeId));
        const validOrder = order.filter(id => idSet.has(id));
        // Append any new items not in order
        result[sk].forEach(r => { if (!validOrder.includes(r.sourceNodeId)) validOrder.push(r.sourceNodeId); });
        // Reorder
        const ordered = validOrder.map((nodeId, i) => {
          const item = result[sk].find(r => r.sourceNodeId === nodeId)!;
          return { ...item, order: i };
        });
        result[sk] = ordered;
      }
    });
    return result;
  }, [refImageUrls, manualEdges, freeRefNodes, imageAssets, shotReferenceOrders, productLine, optionalShotEnabled]);

  const batchIdRef = useRef(''); const instanceRef = useRef<InstanceData | null>(null);
  useEffect(() => { batchIdRef.current = batchId; }, [batchId]);
  useEffect(() => { instanceRef.current = instance; }, [instance]);

  const showError = (e: any) => setError(e?.message || String(e)); const clearError = () => setError('');
  const addLog = (msg: string) => setDemoLog(prev => [...prev, msg]);
  const loadInstance = useCallback(async (iid: string) => { const inst = await api.getVideoInstance(iid); setInstance(inst); setNodes(inst.nodes || []); }, []);
  const refreshAll = async () => { if (instanceRef.current) { const i = await api.getVideoInstance(instanceRef.current.instance_id); setInstance(i); setNodes(i.nodes || []); } };
  const handleSelectNode = useCallback((n: any) => { setSelectedNodeId(n?.node_id || n?.shot_key || null); }, []);

  useEffect(() => { api.listVideoTemplates().then(d => setTemplates(d.templates || [])).catch((e) => console.warn('Templates load failed:', e?.message)); api.listModelAdapters().then(d => setAdapters(d.adapters || [])).catch((e) => console.warn('Adapters load failed:', e?.message)); }, []);
  // Deep-link: auto-load instance from URL hash (e.g. /#instance=<instance_id>).
  // Allows returning to in-progress work after page reload or sharing instance links.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#instance=')) return;
    const iid = hash.slice('#instance='.length);
    if (!iid) return;
    setLoading('加载工作实例...');
    loadInstance(iid)
      .then(() => setLoading(''))
      .catch((e) => { setError('无法加载指定实例: ' + (e?.message || '未知错误')); setLoading(''); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Log node state changes for debugging nodeId binding
  useEffect(() => {
    console.log('INSTANCE_NODES', { instanceId: instance?.instance_id, nodesCount: nodes.length, nodes: nodes.map(n => ({ node_id: n.node_id, shot_key: n.shot_key, status: n.status })) });
  }, [instance, nodes]);

  // Auto-bootstrap: if no deep-link and no instance loaded, try to load or create a batch
  // Ensures canvas shot nodes always have a backend node_id
  const bootstrapRef = useRef(false);
  useEffect(() => {
    if (bootstrapRef.current) return;
    const hash = window.location.hash;
    if (hash.startsWith('#instance=')) return; // deep-link handles loading
    // Let templates load first
    const timer = setTimeout(async () => {
      if (instance || bootstrapRef.current) return;
      bootstrapRef.current = true;
      try {
        // Try to find an existing product
        const products = (await api.listProducts()) as any;
        let pid = '';
        if (products?.products?.length > 0) {
          pid = products.products[0].id;
        } else {
          // Create a demo product
          const s = `SKU-AUTO-${Date.now()}`;
          const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Auto ${s}` });
          pid = d.product_id;
          // Register mock assets so checklist passes
          for (const r of ['main', 'detail1', 'detail2', 'scene', 'brand']) {
            await api.registerAsset(pid, { original_filename: `${s}_${r}.jpg`, file_url: `/mock/${s}_${r}.jpg` });
          }
          const dd = await api.getProduct(pid);
          for (const a of (dd.assets || [])) {
            if (a.role_key !== 'unrecognized') await api.updateAssetRole(pid, a.asset_id, a.role_key);
          }
        }
        setProductId(pid);
        // Get or create a template for desk_calendar
        let tid = templates.find(t => t.product_type === 'desk_calendar')?.template_id;
        if (!tid) {
          const tpl = await api.listVideoTemplates('desk_calendar');
          if (tpl.templates?.length) tid = tpl.templates[0].template_id;
        }
        if (!tid) return;
        setSelTemplateId(tid);
        // Create batch → creates instances + nodes → populate nodes state
        const bd = await api.createVideoBatch(tid, [pid]);
        setBatchId(bd.batch_id);
        batchIdRef.current = bd.batch_id;
        if (bd.instances?.length) {
          await loadInstance(bd.instances[0].instance_id);
          console.log('AUTO_BOOTSTRAP: loaded instance with nodes', bd.instances[0].instance_id);
        }
      } catch (e: any) {
        console.warn('AUTO_BOOTSTRAP failed (use manual flow):', e?.message || e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedNodeId) return;
    setSelectedNodeId(productLine === 'wall_calendar' ? 'W01_main' : 'S01_main');
  }, [productLine, selectedNodeId]);

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
      // 10I: Populate video library for all current product line shots
      const isWall = productLine === 'wall_calendar';
      const shotKeys = [...(isWall ? SHOT_KEYS_WALL : SHOT_KEYS_DESK), ...(optionalShotEnabled ? (isWall ? ['W08_size_ref'] : ['S07_size_ref']) : [])];
      const shotNames: Record<string,string> = isWall ? {W01_main:'挂历-正面展示',W02_hanging:'上墙悬挂展示',W03_detail1:'纸张与印刷细节',W04_detail2:'装订与挂孔结构',W05_scene:'家居/办公墙面场景',W06_size:'尺寸与空间比例',W07_brand:'收尾-品牌',W08_size_ref:'尺寸参考同框'} : {S01_main:'主图-正面',S02_detail1:'细节特写-材质',S03_detail2:'细节特写-结构',S04_motion:'运镜展示',S05_scene:'场景陈列',S06_brand:'收尾-品牌',S07_size_ref:'尺寸参考同框'};
      shotKeys.forEach(sk => { addVideoToLibrary(sk, shotNames[sk] || sk, '/mock/demo-video.mp4', 'single-generate', 'approved', 'mock', 'mock'); });
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
    const config = (storyboardConfigs || {})[shotKey] || getDefaultStoryboardConfig(shotKey, productLine, motionShotVersion);
    const prompt = buildFinalPrompt(config);
    const refs = (shotReferences || {})[shotKey] || [];
    const readyRefs = refs.filter(r => r.status === 'ready');
    const reference_images = readyRefs.map((r, i) => ({
      nodeId: r.sourceNodeId, imageAssetId: r.imageAssetId, url: r.imageUrl, fileName: r.fileName, kind: r.kind, order: i,
    }));
    const batch_count = shotBatchCounts[shotKey] || 1;

    const payload = {
      shotKey, nodeId, prompt, reference_images, batch_count,
      provider: userModelSettings.provider,
      model: userModelSettings.selectedVideoModelId,
      duration: userModelSettings.defaultVideoDuration,
      resolution: userModelSettings.defaultVideoResolution,
      aspectRatio: userModelSettings.defaultAspectRatio,
      audio: userModelSettings.defaultVideoAudio,
    };
    if (typeof window !== 'undefined') (window as any).__lastGeneratePayload = payload;
    setLastGenerateSummary(
      `provider:${payload.provider} model:${payload.model} duration:${payload.duration}s resolution:${payload.resolution} aspectRatio:${payload.aspectRatio} audio:${payload.audio}`
    );

    const now = Date.now();
    const initTask: VideoGenerationTaskState = { shotKey, provider: userModelSettings.provider, model: userModelSettings.selectedVideoModelId, status: 'idle', progress: 0, startedAt: now, updatedAt: now };
    setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: initTask }));

    // ── Mock path (unchanged) ──
    if (userModelSettings.provider === 'mock') {
      setGeneratingShotKeys(prev => [...prev, shotKey]);
      try {
        const result = await api.generateVideoNode(nodeId, { prompt, force: true });
        setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, status: result.status, video_url: result.video_url, cover_url: result.cover_url } : n));
        if (result.status === 'success' && result.video_url) {
          const shotName = (shotReferences || {})[shotKey]?.[0]?.shot_name || shotKey;
          addVideoToLibrary(shotKey, shotName, result.video_url, 'single-generate', 'pending', 'mock', 'mock');
          // 11E-1: Persist to backend video_asset_versions table
          persistVideoToBackend(instanceId, shotKey, result.video_url, 'mock');
        }
        setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'success', progress: 100, updatedAt: Date.now() } }));
      } catch (e: any) {
        setError(e?.message || '生成失败');
        setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'failed', errorMessage: e?.message || '生成失败', updatedAt: Date.now() } }));
      } finally {
        setGeneratingShotKeys(prev => prev.filter(k => k !== shotKey));
      }
      return;
    }

    // ── APIMart path ──
    if (!userModelSettings.apimartApiKey) {
      const msg = '请先在模型设置中填写 APIMart API Key。';
      setError(msg);
      setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'failed', errorMessage: msg, updatedAt: Date.now() } }));
      return;
    }

    const apiKey = userModelSettings.apimartApiKey;
    const baseUrl = userModelSettings.apimartBaseUrl;
    const modelInfo = findModelById(builtinVideoModels, userModelSettings.selectedVideoModelId);

    const runApimartGeneration = async () => {
      try {
        // Phase 1: Upload reference images (with remoteUrl cache)
        setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'uploading', progress: 0, updatedAt: Date.now() } }));
        const uploadedImages: ApimartUploadedImage[] = [];
        const updatedImageAssets = [...imageAssets];
        for (const ref of reference_images) {
          if (!ref.url) { uploadedImages.push({ url: '' }); continue; }
          // Check cache
          const imgAsset = updatedImageAssets.find(a => a.id === ref.imageAssetId || a.url === ref.url);
          const cachedUrl = imgAsset?.remoteUrls?.apimart?.url;
          if (cachedUrl) {
            uploadedImages.push({ url: cachedUrl, filename: ref.fileName });
            continue;
          }
          try {
            const blobResp = await fetch(ref.url);
            const blob = await blobResp.blob();
            const r = await uploadImageToApimart(apiKey, baseUrl, blob, ref.fileName || 'reference.png', blob.type || 'image/png');
            uploadedImages.push(r);
            // Update cache on the matched asset
            const idx = updatedImageAssets.findIndex(a => a.id === ref.imageAssetId || a.url === ref.url);
            if (idx >= 0) {
              updatedImageAssets[idx] = { ...updatedImageAssets[idx], remoteUrls: { ...updatedImageAssets[idx].remoteUrls, apimart: { url: r.url, uploadedAt: Date.now(), filename: r.filename, contentType: r.contentType, bytes: r.bytes } } };
            }
          } catch (e: any) {
            throw new Error(`参考图上传失败: ${sanitizeError(e?.message || '')}`);
          }
        }
        setImageAssets(updatedImageAssets);

        // Phase 2: Submit video generation
        const { request: apimartReq, warnings } = buildApimartVideoRequest(
          modelInfo, prompt, userModelSettings.defaultVideoDuration,
          userModelSettings.defaultAspectRatio, userModelSettings.defaultVideoResolution,
          userModelSettings.defaultVideoAudio, uploadedImages,
        );
        setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'queued', progress: 0, warningMessages: warnings, updatedAt: Date.now() } }));
        const taskId = await submitApimartVideoGeneration(apiKey, baseUrl, apimartReq);

        // Phase 3: Poll (returns final task, no extra request)
        const shotName = (shotReferences || {})[shotKey]?.[0]?.shot_name || shotKey;
        const finalTask = await pollApimartTask(apiKey, baseUrl, taskId, (task) => {
          setVideoGenerationTasks(prev => ({
            ...prev,
            [shotKey]: { ...initTask, taskId, status: task.status, progress: task.progress, errorMessage: task.errorMessage, warningMessages: warnings, updatedAt: Date.now() },
          }));
        });

        if (finalTask.status === 'success' && finalTask.videoUrl) {
          addVideoToLibrary(shotKey, shotName, finalTask.videoUrl, 'apimart-generate', 'pending', 'apimart', userModelSettings.selectedVideoModelId);
          // 11E-1: Persist to backend
          persistVideoToBackend(instanceId, shotKey, finalTask.videoUrl, 'apimart');
          setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, taskId, status: 'success', progress: 100, warningMessages: warnings, updatedAt: Date.now() } }));
        } else {
          setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, taskId, status: 'failed', progress: 0, errorMessage: finalTask.errorMessage || '生成失败', warningMessages: warnings, updatedAt: Date.now() } }));
        }
      } catch (e: any) {
        const errMsg = sanitizeError(e?.message || '');
        setError(errMsg);
        setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'failed', errorMessage: errMsg, updatedAt: Date.now() } }));
      }
    };
    // Fire and forget (poll loop handles async)
    runApimartGeneration().catch((e) => {
      const errMsg = sanitizeError(e?.message || '生成失败');
      setError(errMsg);
      setVideoGenerationTasks(prev => ({ ...prev, [shotKey]: { ...initTask, status: 'failed', errorMessage: errMsg, updatedAt: Date.now() } }));
    });
  };
  const handleReviewAction = (shotKey: string, action: string, reason?: string) => {
    if (action === 'approve') {
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, review_status: 'approved', review_reason: '' } : n));
    } else if (action === 'reject') {
      setNodes(prev => prev.map(n => n.shot_key === shotKey ? { ...n, review_status: 'rejected', review_reason: reason || '' } : n));
    }
  };

  // 10L-1: Approve a specific video version in the library
  // 11E-1: Persist video asset to backend table (fire-and-forget)
  const persistVideoToBackend = (iid: string, sk: string, videoUrl: string, provider: string) => {
    if (!iid) { console.warn('persistVideoToBackend: instanceId is empty'); return; }
    fetch(`/api/v1/video-assets/${iid}/${sk}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl, provider, model: userModelSettings.selectedVideoModelId }),
    }).catch((e) => {
      console.error('persistVideoToBackend failed:', e);
      setError('视频保存到后端失败: ' + (e?.message || '未知错误'));
    });
  };

  // 11E-1: Sync review status to backend (find latest version for this shot)
  const syncReviewToBackend = (sk: string, status: string, reason?: string) => {
    if (!instanceId) return;
    fetch(`/api/v1/video-assets/${instanceId}/${sk}`).then(r => r.json()).then(data => {
      const latest = data.latest;
      if (latest?.id) {
        fetch(`/api/v1/video-assets/versions/${latest.id}/review`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ review_status: status, review_reason: reason || '' }),
        }).catch(() => {});
      }
    }).catch(() => {});
  };

  const handleApproveVideo = useCallback((shotKey: string, videoId: string) => {
    setVideoAssetsByShot(prev => {
      const versions = prev[shotKey];
      if (!versions) return prev;
      return {
        ...prev,
        [shotKey]: versions.map(v =>
          v.id === videoId
            ? { ...v, reviewStatus: 'approved' as const, reviewReason: undefined, reviewedAt: Date.now() }
            : v
        ),
      };
    });
    // 11E-1: Sync review to backend
    if (instanceId) syncReviewToBackend(shotKey, 'approved');
  }, [instanceId]);

  // 10L-1: Reject a specific video version in the library with a reason
  const handleRejectVideo = useCallback((shotKey: string, videoId: string, reason: string) => {
    setVideoAssetsByShot(prev => {
      const versions = prev[shotKey];
      if (!versions) return prev;
      return {
        ...prev,
        [shotKey]: versions.map(v =>
          v.id === videoId
            ? { ...v, reviewStatus: 'rejected' as const, reviewReason: reason, reviewedAt: Date.now() }
            : v
        ),
      };
    });
    if (instanceId) syncReviewToBackend(shotKey, 'rejected', reason);
  }, [instanceId]);

  const handleRegenerateShot = async (nodeId: string, shotKey: string) => {
    if (!nodeId) return;
    // Delegate to full generation pipeline (Mock + APIMart), which handles
    // generatingShotKeys, addVideoToLibrary (creates v2 pending on success),
    // videoGenerationTasks, and node updates.
    // On success: addVideoToLibrary creates v2 pending, sets as current.
    // On failure: old version remains current with original reviewStatus.
    // Does NOT prematurely modify review_status — the existing rejected version
    // stays rejected until a new version is successfully created.
    try {
      await handleGenerateSingleShot(nodeId, shotKey);
    } catch (e: any) { setError(e?.message || '重新生成失败'); }
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

  // 10D-2: Reference image drop handler — adds to library + replaces node image.
  // Do NOT revoke old URL — it may still be referenced by imageAssets.
  const handleDropImageToRefNode = useCallback(async (nodeId: string, file: File) => {
    const { asset } = await addImageAssetFromFile(file, 'drop-reference-node');
    setRefImageUrls(prev => ({ ...prev, [nodeId]: asset.url }));
  }, [addImageAssetFromFile]);

  // 10D-2: Canvas blank area image drop — adds to library + creates free ReferenceImageNode
  const handleDropImageToCanvas = useCallback(async (file: File, canvasPos: { x: number; y: number }) => {
    const { asset } = await addImageAssetFromFile(file, 'drop-canvas');
    const freeId = `free-ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setFreeRefNodes(prev => [...prev, { id: freeId, imageAssetId: asset.id, position: canvasPos }]);
  }, [addImageAssetFromFile]);

  // 10D-2: Delete free reference node (does NOT delete the image from library)
  // 10D-4: Also cleans up related manualEdges
  // 10F: Also cleans up shotReferenceOrders
  const handleDeleteFreeRefNode = useCallback((nodeId: string) => {
    setFreeRefNodes(prev => prev.filter(n => n.id !== nodeId));
    setManualEdges(prev => prev.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
    setShotReferenceOrders(prev => {
      const next: Record<string, string[]> = {};
      let changed = false;
      Object.keys(prev).forEach(sk => {
        const filtered = prev[sk].filter(id => id !== nodeId);
        if (filtered.length !== prev[sk].length) changed = true;
        if (filtered.length > 0) next[sk] = filtered;
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  // 10F: Move a reference up/down within its shot's ordering
  const handleMoveShotRefOrder = useCallback((shotKey: string, sourceNodeId: string, direction: 'up' | 'down') => {
    setShotReferenceOrders(prev => {
      const current = prev[shotKey] || [];
      const idx = current.indexOf(sourceNodeId);
      if (idx < 0) {
        // Initialize order from current shotReferences (default order)
        const refs = (shotReferences as any)[shotKey] || [];
        const newOrder = refs.map((r: any) => r.sourceNodeId);
        return { ...prev, [shotKey]: newOrder };
      }
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= current.length) return prev;
      const next = [...current];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, [shotKey]: next };
    });
  }, [shotReferences]);

  // 10F-2: Drag reorder — set full order array for a shot
  const handleDragSortOrder = useCallback((shotKey: string, orderedIds: string[]) => {
    setShotReferenceOrders(prev => ({ ...prev, [shotKey]: orderedIds }));
  }, []);

  // 10I: Add video to library and set as current (functional setState to avoid stale closure)
  const addVideoToLibrary = useCallback((shotKey: string, shotTitle: string, videoUrl: string, source: 'single-generate'|'apimart-generate'|'history-restore', reviewStatus: 'pending'|'approved' = 'pending', provider?: 'mock' | 'apimart', model?: string) => {
    const versionId = `vid_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    setVideoAssetsByShot(prev => {
      const nextVersions = [...(prev[shotKey] || []), {
        id: versionId, shotKey, shotTitle, productLine,
        videoUrl, createdAt: Date.now(),
        versionLabel: `v${(prev[shotKey] || []).length + 1}`,
        reviewStatus, source, provider, model,
      }];
      return { ...prev, [shotKey]: nextVersions };
    });
    setCurrentVideoByShot(prev => ({ ...prev, [shotKey]: versionId }));
  }, [productLine]);

  // 10I: Set a historical video as current for a shot
  const handleSetCurrentVideo = useCallback((shotKey: string, videoId: string) => {
    setCurrentVideoByShot(prev => ({ ...prev, [shotKey]: videoId }));
  }, []);

  // 10I: Video helpers are React hooks — E2E tests use real UI interactions only

  // 10D-4: Replace reference node image with library asset (by assetId)
  const handleDropAssetToRefNode = useCallback((nodeId: string, assetId: string) => {
    const asset = imageAssetsRef.current.find(a => a.id === assetId);
    if (!asset) return;
    setRefImageUrls(prev => ({ ...prev, [nodeId]: asset.url }));
  }, []);

  // 10D-4: Clear image from a fixed reference node (keeps node, edges, library, asset URLs).
  // IMPORTANT: Do NOT revoke blob URLs here — the same URL may be shared with imageAssets.
  const handleClearReferenceNodeImage = useCallback((nodeId: string) => {
    setRefImageUrls(prev => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  }, []);

  // 10D-4: Clear all fixed reference node images at once.
  // IMPORTANT: Do NOT revoke — URLs are owned by imageAssets, not refImageUrls.
  const handleClearAllFixedReferenceImages = useCallback(() => {
    setRefImageUrls({});
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
      // Do NOT revoke old URL — it may still be in imageAssets
      setRefImageUrls(prev => ({ ...prev, [targetNodeId]: asset.url }));
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
        addImageFromFile(file, hoveredRefNodeIdRef.current || undefined).catch((e) => console.warn('Image paste failed:', e?.message));
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
    <React.Fragment>
    <div data-testid="mvp3-workbench" className="flex flex-col h-screen bg-[#0a0f1a] text-gray-200 font-sans overflow-hidden">
      {/* Header — fixed height */}
      <WorkbenchHeader modelAdapter={modelAdapter} adapters={adapters} onSetModelAdapter={setModelAdapter} onReset={handleReset} loading={loading} onClearAllRefImages={handleClearAllFixedReferenceImages}
        modelSettingsLabel={modelSettingsLabel}
        onOpenModelSettings={() => setModelSettingsOpen(true)}
      />

      {/* Status Summary — fixed height */}
      <div className="flex-shrink-0 border-b border-white/5 bg-[#0d1117]">
        <ProductionStatusSummary productId={productId} checklist={checklist} selTemplateId={selTemplateId}
          batchId={batchId} batchStatus={instance?.status||'ready'} nodes={nodes} instance={instance} />
      </div>

      {/* Three-column body — CSS Grid */}
      {/* 10K-1: Hidden payload summary for E2E (no apiKey) */}
      {lastGenerateSummary && (
        <div data-testid="last-generate-payload-summary" className="hidden">{lastGenerateSummary}</div>
      )}
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
            productLine={productLine} onSetProductLine={handleSetProductLine} motionShotVersion={motionShotVersion}
            nodes={nodes} imageAssets={imageAssets}
            optionalShotEnabled={optionalShotEnabled}
            onToggleOptionalShot={setOptionalShotEnabled}
            videoAssetsByShot={videoAssetsByShot}
            currentVideoByShot={currentVideoByShot}
            onSetCurrentVideo={handleSetCurrentVideo}
            compositionOrder={compositionOrder}
            onSetCompositionOrder={handleSaveCompositionOrder}
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
            optionalShotEnabled={optionalShotEnabled}
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
            onClearRefNodeImage={handleClearReferenceNodeImage}
            onDropAssetToRefNode={handleDropAssetToRefNode}
            onCanvasMouseMove={handleCanvasMouseMove}
            manualEdges={manualEdges}
            onManualEdgeCreate={(edge: any) => setManualEdges(prev => [...prev, edge])}
            onCreateFreeFromLibraryAsset={handleCreateFreeFromLibraryAsset}
            onManualFreeNodeFromAsset={handleManualFreeNodeFromAsset}
            shotReferences={shotReferences}
            videoAssetsByShot={videoAssetsByShot}
            currentVideoByShot={currentVideoByShot}
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
            onReviewAction={handleReviewAction}
            shotReferences={shotReferences}
            onMoveShotRefOrder={handleMoveShotRefOrder}
            onDragSortOrder={handleDragSortOrder}
            shotBatchCounts={shotBatchCounts}
            onSetShotBatchCount={(sk, n) => setShotBatchCounts(prev => ({ ...prev, [sk]: n }))}
            videoAssetsByShot={videoAssetsByShot}
            currentVideoByShot={currentVideoByShot}
            onApproveVideo={handleApproveVideo}
            onRejectVideo={handleRejectVideo}
          />
        </div>
      </div>
    </div>

    <ModelSettingsPanel
      isOpen={modelSettingsOpen}
      onClose={() => setModelSettingsOpen(false)}
      onSettingsChanged={handleModelSettingsChanged}
    />
    </React.Fragment>
  );
};
