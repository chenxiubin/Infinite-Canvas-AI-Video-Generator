import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/mvp3';

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
  const [productId, setProductId] = useState('');
  const [checklist, setChecklist] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selTemplateId, setSelTemplateId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);

  // Refs for stable closure access (avoid stale React state in handlers)
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

  // --- Handlers (use refs to avoid stale closures) ---

  const handleDemoDesk = async () => {
    try { clearError(); setLoading('Creating demo...');
      const s = `SKU-DEMO-${Date.now()}`;
      const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Demo ${s}` });
      const pid = d.product_id;
      setProductId(pid);
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
      if (d.instances?.length) {
        await loadInstance(d.instances[0].instance_id);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleGenerate = async () => {
    const bid = batchIdRef.current;
    if (!bid) return;
    try { clearError(); setLoading('Generating...');
      await api.generateVideoBatch(bid);
      // Directly reload instance to refresh nodes in state
      const bd = await api.getVideoBatch(bid);
      if (bd.instances?.length) {
        const iid = bd.instances[0].instance_id;
        const freshInst = await api.getVideoInstance(iid);
        setInstance(freshInst);
        setNodes(freshInst.nodes || []);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleMerge = async () => {
    const inst = instanceRef.current;
    if (!inst) return;
    try { clearError(); setLoading('Merging...');
      await api.mergePreview(inst.instance_id);
      await loadInstance(inst.instance_id);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleApproveAll = async () => {
    const inst = instanceRef.current;
    if (!inst) return;
    try { clearError(); setLoading('Approving...');
      await api.reviewInstance(inst.instance_id, 'approve');
      await loadInstance(inst.instance_id);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleExport = async () => {
    const inst = instanceRef.current;
    if (!inst) return;
    try { clearError(); setLoading('Exporting...');
      await api.exportInstance(inst.instance_id);
      await loadInstance(inst.instance_id);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const allSuccess = nodes.length > 0 && nodes.every(n => n.status === 'success');
  const canExport = instance?.review_status === 'approved';
  const isReady = checklist?.is_ready;

  return (
    <div data-testid="mvp3-workbench" className="min-h-screen bg-[#0f172a] text-gray-200 p-6 font-sans">
      <h1 className="text-xl font-bold mb-1">MVP-3 视频生产工作台</h1>
      {loading && <div className="text-blue-400 text-xs mb-2">{loading}</div>}
      {error && <div data-testid="error-message" className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded mb-4 text-sm">{error}<button onClick={clearError} className="ml-4 text-red-400">x</button></div>}

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
        <button data-testid="create-video-batch-button" disabled={!isReady || !selTemplateId}
          onClick={handleCreateBatch}
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
    </div>
  );
};
