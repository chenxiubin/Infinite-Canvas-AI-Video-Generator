import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/mvp3';
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
      addLog('generated success'); await api.mergePreview(fb.instances[0].instance_id);
      const mi=await api.getVideoInstance(fb.instances[0].instance_id);setInstance(mi);setNodes(mi.nodes||[]);addLog('preview generated');
      await api.reviewInstance(mi.instance_id,'approve');const ai=await api.getVideoInstance(mi.instance_id);setInstance(ai);setNodes(ai.nodes||[]);addLog('review approved');
      await api.exportInstance(ai.instance_id);const ei=await api.getVideoInstance(ai.instance_id);setInstance(ei);setNodes(ei.nodes||[]);addLog('mock export completed');
    }catch(e){showError(e);addLog(`ERROR: ${e?.message||e}`);}finally{setLoading('');}
  };
  const handleReset = () => { assets.forEach(a => { if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); }); setProductId('');setChecklist(null);setBatchId('');setInstance(null);setNodes([]);setSelTemplateId('');setError('');setDemoLog([]);batchIdRef.current='';instanceRef.current=null;setSelectedNodeId(null);setAssets([]);setShotBindings([]);setConnectingAssetId(null); };
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
  const selectedBinding = shotBindings.find(b => b.shotKey === selectedNode?.shot_key);
  const getBoundAsset = (assetId?: string) => assets.find(a => a.id === assetId);

  const allSuccess = nodes.length>0&&nodes.every(n=>n.status==='success');
  const canExport = instance?.review_status==='approved';
  const isReady = checklist?.is_ready;

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
        style={{ gridTemplateColumns: '300px minmax(0, 1fr) 360px' }}>
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
          />
        </div>

        {/* Center: Canvas — always visible as main area */}
        <main className="min-w-0 min-h-0 overflow-hidden bg-[#060b14]">
          <ProductionCanvasView instance={instance} nodes={nodes} onRefresh={refreshAll}
            onSelectNode={handleSelectNode}
            assets={assets} shotBindings={shotBindings}
            onConnectBinding={handleBindShotFrame}
            onDeleteBinding={(shotKey, frameType) => handleBindShotFrame(shotKey, frameType as any, null)}
            connectingAssetId={connectingAssetId}
            onStartConnecting={setConnectingAssetId}
            onCancelConnecting={() => setConnectingAssetId(null)} />
        </main>

        {/* Right: Inspector */}
        <div className="min-h-0 overflow-hidden">
          <RightInspectorPanel node={selectedNode} instanceId={instance?.instance_id||''} onRefresh={refreshAll}
            assets={assets} selectedBinding={selectedBinding} getBoundAsset={getBoundAsset}
            onBindShotFrame={handleBindShotFrame} />
        </div>
      </div>
    </div>
  );
};
