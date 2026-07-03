import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/mvp3';
import { ProductionCanvasView } from './ProductionCanvasView';
import { ProductionStatusSummary } from './ProductionStatusSummary';

type NodeStatus = 'pending' | 'running' | 'success' | 'failed';
interface NodeItem { node_id: string; shot_key: string; status: NodeStatus; [key: string]: any }
interface InstanceData { instance_id: string; status: string; draft_preview_url?: string; review_status?: string; export_status?: string; final_video_url?: string; nodes?: NodeItem[] }

const statusCls: Record<string, string> = {
    pending: 'bg-gray-600 text-gray-200', running: 'bg-blue-600 text-white',
    success: 'bg-green-600 text-white', failed: 'bg-red-600 text-white',
    completed: 'bg-green-600 text-white', not_started: 'bg-gray-700 text-gray-400',
    not_ready: 'bg-gray-700 text-gray-400', approved: 'bg-green-600 text-white', rejected: 'bg-red-600 text-white',
};

function StatusBadge({ status }: { status: string }) {
  const cls = statusCls[status] || 'bg-gray-700 text-gray-300';
  return <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${cls}`}>{status}</span>;
}

export const ProductionWorkbench: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const [demoLog, setDemoLog] = useState<string[]>([]);
  const [productId, setProductId] = useState('');
  const [checklist, setChecklist] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selTemplateId, setSelTemplateId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [viewMode, setViewMode] = useState<'form' | 'canvas'>('form');
  const [modelAdapter, setModelAdapter] = useState('mock');
  const [adapters, setAdapters] = useState<any[]>([]);

  useEffect(() => {
    api.listModelAdapters().then(d => setAdapters(d.adapters || [])).catch(() => {});
  }, []);

  const batchIdRef = useRef('');
  const instanceRef = useRef<InstanceData | null>(null);
  useEffect(() => { batchIdRef.current = batchId; }, [batchId]);
  useEffect(() => { instanceRef.current = instance; }, [instance]);

  const showError = (e: any) => setError(e?.message || String(e));
  const clearError = () => setError('');

  const refreshProduct = async (pid: string) => {
    const d = await api.getProduct(pid);
    setChecklist(d.checklist || null);
  };

  const loadInstance = useCallback(async (iid: string) => {
    const inst = await api.getVideoInstance(iid);
    setInstance(inst);
    setNodes(inst.nodes || []);
  }, []);

  useEffect(() => {
    api.listVideoTemplates().then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  const addLog = (msg: string) => setDemoLog(prev => [...prev, msg]);

  // --- Full Demo ---
  const handleFullDemo = async () => {
    try { clearError(); setDemoLog([]); setLoading('Running full demo...');
      // 1. Create product
      addLog('creating product...');
      const s = `SKU-DEMO-${Date.now()}`;
      const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Demo ${s}` });
      const pid = d.product_id; setProductId(pid);
      addLog('product created');

      // 2. Register assets
      for (const r of ['main', 'detail1', 'detail2', 'scene', 'brand']) {
        await api.registerAsset(pid, { original_filename: `${s}_${r}.jpg`, file_url: `/mock/${s}_${r}.jpg` });
      }
      addLog('assets registered');

      // 3. Confirm roles
      const dd = await api.getProduct(pid);
      for (const a of (dd.assets || [])) {
        if (a.role_key !== 'unrecognized') await api.updateAssetRole(pid, a.asset_id, a.role_key);
      }
      await refreshProduct(pid);
      addLog('roles confirmed, checklist ready');

      // 4. Select template
      const tplId = templates.find(t => t.product_type === 'desk_calendar')?.template_id || (await api.listVideoTemplates('desk_calendar')).templates[0].template_id;
      setSelTemplateId(tplId);
      addLog('template selected');

      // 5. Create batch
      const bd = await api.createVideoBatch(tplId, [pid]);
      setBatchId(bd.batch_id); batchIdRef.current = bd.batch_id;
      addLog('video batch created');

      // 6. Load instance
      if (bd.instances?.length) {
        const inst = await api.getVideoInstance(bd.instances[0].instance_id);
        setInstance(inst); setNodes(inst.nodes || []);
        addLog('instance loaded, 6 nodes pending');
      }

      // 7. Generate
      await api.generateVideoBatch(bd.batch_id);
      const freshBatch = await api.getVideoBatch(bd.batch_id);
      if (freshBatch.instances?.length) {
        const freshInst = await api.getVideoInstance(freshBatch.instances[0].instance_id);
        setInstance(freshInst); setNodes(freshInst.nodes || []);
        const ok = freshInst.nodes?.every((n: any) => n.status === 'success');
        addLog(ok ? '6 nodes generated success' : 'some nodes failed');
      }

      // 8. Merge
      await api.mergePreview(freshBatch.instances[0].instance_id);
      const mergedInst = await api.getVideoInstance(freshBatch.instances[0].instance_id);
      setInstance(mergedInst); setNodes(mergedInst.nodes || []);
      addLog('draft preview generated');

      // 9. Approve
      await api.reviewInstance(mergedInst.instance_id, 'approve');
      const approvedInst = await api.getVideoInstance(mergedInst.instance_id);
      setInstance(approvedInst); setNodes(approvedInst.nodes || []);
      addLog('review approved');

      // 10. Export
      await api.exportInstance(approvedInst.instance_id);
      const exportedInst = await api.getVideoInstance(approvedInst.instance_id);
      setInstance(exportedInst); setNodes(exportedInst.nodes || []);
      addLog('mock export completed');

    } catch (e) { showError(e); addLog(`ERROR: ${e?.message || e}`); } finally { setLoading(''); }
  };

  const handleReset = () => {
    setProductId(''); setChecklist(null); setBatchId(''); setInstance(null); setNodes([]);
    setSelTemplateId(''); setError(''); setDemoLog([]); batchIdRef.current = ''; instanceRef.current = null;
  };

  // --- Per-step handlers ---
  const handleDemoDesk = async () => {
    try { clearError(); setLoading('Creating demo...');
      const s = `SKU-DEMO-${Date.now()}`;
      const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Demo ${s}` });
      const pid = d.product_id; setProductId(pid);
      for (const r of ['main', 'detail1', 'detail2', 'scene', 'brand']) {
        await api.registerAsset(pid, { original_filename: `${s}_${r}.jpg`, file_url: `/mock/${s}_${r}.jpg` });
      }
      const dd = await api.getProduct(pid);
      for (const a of (dd.assets || [])) {
        if (a.role_key !== 'unrecognized') await api.updateAssetRole(pid, a.asset_id, a.role_key);
      }
      await refreshProduct(pid);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleCreateBatch = async () => {
    if (!productId || !selTemplateId) return;
    try { clearError(); setLoading('Creating batch...');
      const d = await api.createVideoBatch(selTemplateId, [productId]);
      setBatchId(d.batch_id); batchIdRef.current = d.batch_id;
      if (d.instances?.length) await loadInstance(d.instances[0].instance_id);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleGenerate = async () => {
    const bid = batchIdRef.current;
    if (!bid) return;
    try { clearError(); setLoading('Generating...');
      await api.generateVideoBatch(bid);
      const bd = await api.getVideoBatch(bid);
      if (bd.instances?.length) {
        const freshInst = await api.getVideoInstance(bd.instances[0].instance_id);
        setInstance(freshInst); setNodes(freshInst.nodes || []);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleMerge = async () => {
    const inst = instanceRef.current; if (!inst) return;
    try { clearError(); setLoading('Merging...'); await api.mergePreview(inst.instance_id); await loadInstance(inst.instance_id); } catch (e) { showError(e); } finally { setLoading(''); }
  };
  const handleApproveAll = async () => {
    const inst = instanceRef.current; if (!inst) return;
    try { clearError(); setLoading('Approving...'); await api.reviewInstance(inst.instance_id, 'approve'); await loadInstance(inst.instance_id); } catch (e) { showError(e); } finally { setLoading(''); }
  };
  const handleExport = async () => {
    const inst = instanceRef.current; if (!inst) return;
    try { clearError(); setLoading('Exporting...'); await api.exportInstance(inst.instance_id); await loadInstance(inst.instance_id); } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const allSuccess = nodes.length > 0 && nodes.every(n => n.status === 'success');
  const canExport = instance?.review_status === 'approved';
  const isReady = checklist?.is_ready;

  return (
    <div data-testid="mvp3-workbench" className="min-h-screen bg-[#0f172a] text-gray-200 p-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold">MVP-3 AI 视频生产工作台</h1>
          <p className="text-xs text-gray-500">产品素材包 → 视频模板 → Mock 生成 → 草稿预览 → 审核 → Mock 导出 → 画布可视化</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="run-full-demo-button" onClick={handleFullDemo} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-1.5 rounded font-medium">一键运行 Demo</button>
          <button data-testid="reset-current-state-button" onClick={handleReset} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1 rounded">重置</button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-3">
        <button data-testid="workbench-tab-form" onClick={() => setViewMode('form')}
          className={`text-xs px-3 py-1 rounded ${viewMode === 'form' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>工作台</button>
        <button data-testid="workbench-tab-canvas" onClick={() => setViewMode('canvas')}
          className={`text-xs px-3 py-1 rounded ${viewMode === 'canvas' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>画布视图</button>
      </div>

      {loading && <div className="text-blue-400 text-xs mb-2">{loading}</div>}
      {error && <div data-testid="error-message" className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded mb-4 text-sm">{error}<button onClick={clearError} className="ml-4 text-red-400">x</button></div>}

      {/* Demo step log */}
      {demoLog.length > 0 && (
        <div data-testid="demo-step-log" className="bg-[#1e293b] border border-white/10 rounded-lg p-3 mb-4 text-xs text-gray-400">
          <div className="text-gray-300 font-medium mb-1">Demo 步骤</div>
          {demoLog.map((msg, i) => (
            <div key={i} className="text-gray-500">{i + 1}. {msg}</div>
          ))}
          {demoLog[demoLog.length - 1] === 'mock export completed' && (
            <div data-testid="demo-complete-message" className="text-green-400 font-medium mt-1">Demo 流程已完成</div>
          )}
        </div>
      )}

      {/* Status summary — always visible */}
      <ProductionStatusSummary productId={productId} checklist={checklist} selTemplateId={selTemplateId}
        batchId={batchId} batchStatus={instance?.status || 'ready'} nodes={nodes} instance={instance} />

      {/* Model settings */}
      <div data-testid="model-settings-panel" className="bg-[#1e293b] border border-white/10 rounded-lg p-3 mb-4 text-xs">
        <span className="text-gray-400 mr-3">模型设置</span>
        <select data-testid="model-adapter-select" value={modelAdapter} onChange={e => setModelAdapter(e.target.value)}
          className="bg-[#0f172a] border border-white/10 rounded px-2 py-0.5 text-gray-200">
          {adapters.map(a => (
            <option key={a.adapter_key} value={a.adapter_key} disabled={!a.configured}>
              {a.provider_name} ({a.adapter_key}) {a.configured ? '' : '(未配置)'}
            </option>
          ))}
        </select>
        <span data-testid="model-adapter-status-mock" className="text-green-400 ml-2">mock: ready</span>
        <span data-testid="selected-model-adapter" className="text-gray-500 ml-3">
          当前: {modelAdapter}
        </span>
        {adapters.filter(a => a.adapter_key === 'external_http' && !a.configured).map(a => (
          <span key={a.adapter_key} data-testid="model-adapter-status-external_http" className="text-red-400 ml-2">
            external_http 未配置
          </span>
        ))}
      </div>

      {/* Canvas view */}
      {viewMode === 'canvas' && (
        <ProductionCanvasView instance={instance} nodes={nodes} onRefresh={() => {
          if (instanceRef.current) api.getVideoInstance(instanceRef.current.instance_id).then(i => { setInstance(i); setNodes(i.nodes || []); }).catch(() => {});
        }} />
      )}

      {/* Form view */}
      {viewMode === 'form' && (<>
      {/* 1. Product */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">1. 产品素材包</h2>
        <button data-testid="create-demo-product-button" onClick={handleDemoDesk} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-1 rounded">Demo 台历素材包</button>
        {productId && <div data-testid="product-id" className="text-xs text-gray-400 mt-2">product_id: {productId}</div>}
        {isReady !== null && (
          <div data-testid={isReady ? 'checklist-ready' : 'checklist-not-ready'} className="mt-2 text-xs">
            {isReady ? <span className="text-green-400">checklist: ready</span> : <span className="text-yellow-400">checklist: not ready</span>}
          </div>
        )}
      </section>

      {/* 2. Template */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">2. 视频模板</h2>
        <div className="flex gap-2 flex-wrap">
          {templates.map(t => (
            <button key={t.template_id} data-testid={`template-${t.product_type}`}
              onClick={() => setSelTemplateId(t.template_id)}
              className={`text-xs px-3 py-2 rounded border ${selTemplateId === t.template_id ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-white/10 bg-[#0f172a] text-gray-400 hover:border-gray-400'}`}>
              {t.template_name}
            </button>
          ))}
        </div>
        {selTemplateId && <div data-testid="selected-template-id" className="text-xs text-gray-400 mt-2">{selTemplateId}</div>}
      </section>

      {/* 3. Batch */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">3. 视频批次</h2>
        <button data-testid="create-video-batch-button" disabled={!isReady || !selTemplateId} onClick={handleCreateBatch}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1 rounded">创建 Batch</button>
        {batchId && <div data-testid="batch-id" className="text-xs text-gray-400 mt-2">batch_id: {batchId}</div>}
        {instance && <div data-testid="instance-id" className="text-xs text-gray-400">instance_id: {instance.instance_id}</div>}
        {batchId && <button data-testid="generate-batch-button" onClick={handleGenerate} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-1 rounded mt-2">Generate Batch</button>}
      </section>

      {/* 4. Nodes */}
      {nodes.length > 0 && (
        <section data-testid="node-list" className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">4. 节点状态 ({nodes.length})</h2>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {nodes.map(n => (
              <div key={n.node_id} data-testid={`node-row-${n.shot_key}`} className="flex items-center gap-3 bg-[#0f172a] rounded px-3 py-2">
                <span className="text-gray-300 w-20">{n.shot_key}</span>
                <span data-testid={`node-status-${n.shot_key}`}><StatusBadge status={n.status} /></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Preview / Review / Export */}
      {instance && allSuccess && (
        <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">5. 预览 / 审核 / 导出</h2>
          <div className="space-y-3">
            <button data-testid="merge-preview-button" onClick={handleMerge} className="bg-purple-700 hover:bg-purple-600 text-white text-sm px-3 py-1 rounded">Merge Preview</button>
            {instance.draft_preview_url && <div data-testid="draft-preview-url" className="text-green-400 text-xs mt-1">{instance.draft_preview_url}</div>}
            <div>
              <div data-testid="instance-review-status" className="text-xs text-gray-400 mb-1">review: {instance.review_status || '-'}</div>
              <button data-testid="approve-all-button" onClick={handleApproveAll} className="bg-green-700 hover:bg-green-600 text-white text-sm px-3 py-1 rounded mt-1">Approve All</button>
            </div>
            <div>
              <button data-testid="export-button" disabled={!canExport} onClick={handleExport}
                className="bg-orange-700 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1 rounded">Export</button>
              {instance.final_video_url && <div data-testid="final-video-url" className="text-green-400 text-xs mt-1">{instance.final_video_url}</div>}
            </div>
          </div>
        </section>
      )}
      </>)}
    </div>
  );
};
