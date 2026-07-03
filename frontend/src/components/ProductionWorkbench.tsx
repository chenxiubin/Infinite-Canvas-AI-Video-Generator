import React, { useState, useEffect } from 'react';
import * as api from '../api/mvp3';

type NodeStatus = 'pending' | 'running' | 'success' | 'failed';
type ReviewStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'not_ready';

interface AssetItem { asset_id: string; role_key: string; original_filename: string; role_confirmed: boolean; role_source: string }
interface ChecklistData { is_ready: boolean; missing_required_roles: string[]; unconfirmed_required_roles: string[]; fallback_plan: any }
interface TemplateItem { template_id: string; template_key: string; product_type: string; template_name: string; total_duration_seconds: number; shot_count: number }
interface NodeItem { node_id: string; shot_key: string; shot_name: string; shot_order: number; required_asset_role: string; bound_asset_role: string; bound_asset_source: string; status: NodeStatus; review_status?: ReviewStatus; video_url?: string; cover_url?: string }
interface InstanceData { instance_id: string; product_id: string; sku: string; status: string; draft_preview_url?: string; review_status?: string; export_status?: string; final_video_url?: string; nodes?: NodeItem[] }

function badge(cls: string, label: string) {
  return React.createElement('span', { className: `inline-block px-2 py-0.5 text-xs rounded font-medium ${cls}` }, label);
}

function statusBadge(s: string) {
  const map: Record<string, [string, string]> = {
    pending: ['bg-gray-600 text-gray-200', 'pending'],
    running: ['bg-blue-600 text-white', 'running'],
    success: ['bg-green-600 text-white', 'success'],
    failed: ['bg-red-600 text-white', 'failed'],
    completed: ['bg-green-600 text-white', 'completed'],
    not_started: ['bg-gray-700 text-gray-400', 'not_started'],
    not_ready: ['bg-gray-700 text-gray-400', 'not_ready'],
    not_required: ['bg-gray-700 text-gray-400', 'not_required'],
    approved: ['bg-green-600 text-white', 'approved'],
    rejected: ['bg-red-600 text-white', 'rejected'],
  };
  const [c, l] = map[s] || ['bg-gray-700 text-gray-300', s];
  return badge(c, l);
}

export const ProductionWorkbench: React.FC = () => {
  // State
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');

  // Product
  const [ptype, setPtype] = useState('desk_calendar');
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [productId, setProductId] = useState('');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);

  // Templates
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selTemplateId, setSelTemplateId] = useState('');

  // Batch
  const [batchId, setBatchId] = useState('');
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);

  // Review
  const [rejectReason, setRejectReason] = useState('');

  // Load templates on mount
  useEffect(() => {
    api.listVideoTemplates().then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  const clearError = () => setError('');
  const showError = (e: any) => setError(e?.message || String(e));

  const refreshProduct = async (pid: string) => {
    const d = await api.getProduct(pid);
    setAssets(d.assets || []);
    setChecklist(d.checklist || null);
  };

  // --- Product ---
  const handleCreateProduct = async () => {
    try { clearError(); setLoading('Creating product...');
      const d = await api.createProduct({ product_type: ptype, sku, title });
      setProductId(d.product_id); refreshProduct(d.product_id);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleRegisterAssets = async () => {
    if (!productId) return;
    try { clearError(); setLoading('Registering assets...');
      const roles = ['main', 'detail1', 'detail2', 'scene', 'brand'];
      for (const r of roles) {
        await api.registerAsset(productId, { original_filename: `${sku}_${r}.jpg`, file_url: `/mock/${sku}_${r}.jpg` });
      }
      await refreshProduct(productId);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleConfirmAll = async () => {
    if (!productId) return;
    try { clearError(); setLoading('Confirming roles...');
      for (const a of assets) {
        if (!a.role_confirmed && a.role_key !== 'unrecognized') {
          await api.updateAssetRole(productId, a.asset_id, a.role_key);
        }
      }
      await refreshProduct(productId);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleDemoDesk = async () => {
    try { clearError(); setLoading('Creating demo...');
      const s = `SKU-DEMO-${Date.now()}`;
      const d = await api.createProduct({ product_type: 'desk_calendar', sku: s, title: `Demo 台历 ${s}` });
      const pid = d.product_id;
      setSku(s); setTitle(`Demo 台历 ${s}`); setProductId(pid);
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

  // --- Batch ---
  const handleCreateBatch = async () => {
    if (!productId || !selTemplateId) return;
    try { clearError(); setLoading('Creating batch...');
      const d = await api.createVideoBatch(selTemplateId, [productId]);
      setBatchId(d.batch_id);
      if (d.instances?.length) {
        const inst = await api.getVideoInstance(d.instances[0].instance_id);
        setInstance(inst);
        setNodes(inst.nodes || []);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleGenerate = async () => {
    if (!batchId) return;
    try { clearError(); setLoading('Generating...');
      await api.generateVideoBatch(batchId);
      if (instance) {
        const inst = await api.getVideoInstance(instance.instance_id);
        setInstance(inst); setNodes(inst.nodes || []);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleRetry = async (nodeId: string) => {
    try { clearError(); setLoading('Retrying...');
      await api.retryVideoNode(nodeId);
      if (instance) {
        const inst = await api.getVideoInstance(instance.instance_id);
        setInstance(inst); setNodes(inst.nodes || []);
      }
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  // --- Merge / Review / Export ---
  const handleMerge = async () => {
    if (!instance) return;
    try { clearError(); setLoading('Merging...');
      await api.mergePreview(instance.instance_id);
      const inst = await api.getVideoInstance(instance.instance_id);
      setInstance(inst); setNodes(inst.nodes || []);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleReviewNode = async (nodeId: string, action: string) => {
    try { clearError();
      await api.reviewVideoNode(nodeId, action, action === 'reject' ? rejectReason : '');
      if (instance) {
        const inst = await api.getVideoInstance(instance.instance_id);
        setInstance(inst); setNodes(inst.nodes || []);
      }
    } catch (e) { showError(e); }
  };

  const handleApproveAll = async () => {
    if (!instance) return;
    try { clearError(); setLoading('Approving...');
      await api.reviewInstance(instance.instance_id, 'approve');
      const inst = await api.getVideoInstance(instance.instance_id);
      setInstance(inst); setNodes(inst.nodes || []);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const handleExport = async () => {
    if (!instance) return;
    try { clearError(); setLoading('Exporting...');
      await api.exportInstance(instance.instance_id);
      const inst = await api.getVideoInstance(instance.instance_id);
      setInstance(inst); setNodes(inst.nodes || []);
    } catch (e) { showError(e); } finally { setLoading(''); }
  };

  const allSuccess = nodes.length > 0 && nodes.every(n => n.status === 'success');
  const canExport = instance?.review_status === 'approved';

  return (
    <div className="min-h-screen bg-[#0f172a] text-gray-200 p-6 font-sans">
      <h1 className="text-xl font-bold mb-1">MVP-3 视频生产工作台</h1>
      <p className="text-xs text-gray-500 mb-6">基于后端 API 的完整视频生产闭环</p>

      {error && (
        <div className="bg-red-900/50 border border-red-500/50 text-red-300 px-4 py-3 rounded mb-4 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}
      {loading && (
        <div className="bg-blue-900/30 border border-blue-500/30 text-blue-300 px-4 py-2 rounded mb-4 text-sm">{loading}</div>
      )}

      {/* Section 1: Product */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">1. 产品素材包</h2>
        <div className="flex flex-wrap gap-3 mb-3">
          <select value={ptype} onChange={e => setPtype(e.target.value)} className="bg-[#0f172a] border border-white/10 rounded px-2 py-1 text-sm">
            <option value="desk_calendar">台历</option>
            <option value="wall_calendar">挂历</option>
          </select>
          <input placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} className="bg-[#0f172a] border border-white/10 rounded px-2 py-1 text-sm w-40" />
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} className="bg-[#0f172a] border border-white/10 rounded px-2 py-1 text-sm w-40" />
          <button onClick={handleCreateProduct} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1 rounded">创建产品</button>
          <button onClick={handleDemoDesk} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-1 rounded">Demo 台历素材包</button>
        </div>
        {productId && (
          <div className="text-xs text-gray-400 mb-2">product_id: {productId}&nbsp;&nbsp;|&nbsp;&nbsp;status: {checklist ? (checklist.is_ready ? badge('bg-green-600 text-white', 'ready') : badge('bg-yellow-600 text-white', 'not ready')) : '...'}</div>
        )}
        {assets.length > 0 && (
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1">素材列表 ({assets.length})</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {assets.map(a => (
                <div key={a.asset_id} className="flex items-center gap-2 bg-[#0f172a] rounded px-2 py-1">
                  <span className="text-gray-300">{a.role_key}</span>
                  <span className="text-gray-500 truncate">{a.original_filename}</span>
                  {a.role_confirmed ? badge('bg-green-700 text-green-200', 'confirmed') : badge('bg-yellow-700 text-yellow-200', 'unconfirmed')}
                </div>
              ))}
            </div>
          </div>
        )}
        {productId && (
          <div className="flex gap-2">
            {(!checklist?.is_ready || assets.length < 5) && (
              <button onClick={handleRegisterAssets} className="bg-gray-700 hover:bg-gray-600 text-sm px-3 py-1 rounded">登记 5 个素材</button>
            )}
            <button onClick={handleConfirmAll} className="bg-gray-700 hover:bg-gray-600 text-sm px-3 py-1 rounded">确认全部 role</button>
          </div>
        )}
        {checklist && (
          <div className="mt-2 text-xs text-gray-500">
            missing: [{checklist.missing_required_roles.join(',') || 'none'}]&nbsp;
            unconfirmed: [{checklist.unconfirmed_required_roles.join(',') || 'none'}]&nbsp;
            {checklist.is_ready ? '✅ ready' : '❌ not ready'}
          </div>
        )}
      </section>

      {/* Section 2: Template */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">2. 视频模板</h2>
        <div className="flex gap-2 flex-wrap">
          {templates.map(t => (
            <button
              key={t.template_id}
              onClick={() => setSelTemplateId(t.template_id)}
              className={`text-xs px-3 py-2 rounded border ${selTemplateId === t.template_id ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-white/10 bg-[#0f172a] text-gray-400 hover:border-gray-400'}`}
            >
              <div className="font-medium">{t.template_name}</div>
              <div className="text-gray-500">{t.total_duration_seconds}s · {t.shot_count} shots</div>
            </button>
          ))}
        </div>
      </section>

      {/* Section 3: Batch */}
      <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">3. 视频批次</h2>
        <div className="flex gap-2 mb-3">
          <button
            disabled={!productId || !selTemplateId || !checklist?.is_ready}
            onClick={handleCreateBatch}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1 rounded"
          >
            创建 Batch
          </button>
          <span className="text-xs text-gray-500 self-center">
            {!checklist?.is_ready ? '(checklist not ready)' : !selTemplateId ? '(select template)' : ''}
          </span>
        </div>
        {batchId && (
          <div className="text-xs text-gray-400 mb-2">batch_id: {batchId}{instance ? ` | instance: ${instance.instance_id} | status: ${instance.status}` : ''}</div>
        )}
        {batchId && (
          <button onClick={handleGenerate} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-1 rounded">Generate Batch</button>
        )}
      </section>

      {/* Section 4: Nodes */}
      {nodes.length > 0 && (
        <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">4. 节点状态 ({nodes.length})</h2>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {nodes.map(n => (
              <div key={n.node_id} className="flex items-center gap-3 bg-[#0f172a] rounded px-3 py-2">
                <span className="text-gray-300 w-20">{n.shot_key}</span>
                <span className="text-gray-500 w-16">{n.required_asset_role}</span>
                <span className="text-gray-600 w-12">{n.bound_asset_role || '-'}</span>
                {statusBadge(n.status)}
                {n.video_url && <span className="text-green-400 truncate w-32 text-[10px]">{n.video_url}</span>}
                {n.status === 'failed' && (
                  <button onClick={() => handleRetry(n.node_id)} className="bg-orange-700 hover:bg-orange-600 text-white px-2 py-0.5 rounded text-xs">Retry</button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {allSuccess ? 'All nodes success — ready for merge preview' : 'Some nodes not yet success'}
          </div>
        </section>
      )}

      {/* Section 5: Preview / Review / Export */}
      {instance && allSuccess && (
        <section className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold mb-3">5. 预览 / 审核 / 导出</h2>
          <div className="space-y-3">
            {/* Merge */}
            <div className="flex gap-2 items-center">
              <button onClick={handleMerge} className="bg-purple-700 hover:bg-purple-600 text-white text-sm px-3 py-1 rounded">Merge Preview</button>
              {instance.draft_preview_url && <span className="text-green-400 text-xs truncate">{instance.draft_preview_url}</span>}
            </div>

            {/* Review */}
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Review: {instance.review_status ? statusBadge(instance.review_status) : '-'}
              </div>
              <div className="flex gap-2 items-center">
                <input placeholder="reject reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="bg-[#0f172a] border border-white/10 rounded px-2 py-1 text-xs w-40" />
                {nodes.filter(n => n.status === 'success').map(n => (
                  <span key={n.node_id} className="flex gap-1">
                    <button onClick={() => handleReviewNode(n.node_id, 'approve')} className="bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded text-xs">✓ {n.shot_key}</button>
                    <button onClick={() => handleReviewNode(n.node_id, 'reject')} className="bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded text-xs">✕</button>
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <button onClick={handleApproveAll} className="bg-green-700 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">Approve All</button>
              </div>
            </div>

            {/* Export */}
            <div className="flex gap-2 items-center">
              <button
                disabled={!canExport}
                onClick={handleExport}
                className="bg-orange-700 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-3 py-1 rounded"
              >
                Export
              </button>
              <span className="text-xs text-gray-500">{!canExport ? '(review not approved)' : ''}</span>
              {instance.final_video_url && (
                <span className="text-green-400 text-xs truncate">{instance.final_video_url}</span>
              )}
              {instance.export_status && <span className="text-xs">{statusBadge(instance.export_status)}</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
