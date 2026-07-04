import React from 'react';
import { DemoStepLog } from './DemoStepLog';
import { Package, FileVideo, Layers, Cpu, Play, Eye, CheckCheck, Download, X, AlertTriangle, Image, Upload } from 'lucide-react';

interface WorkbenchAsset { id: string; filename: string; url: string; role: string; createdAt: number; }

interface Props {
  productId: string; isReady: boolean | undefined; templates: any[]; selTemplateId: string;
  batchId: string; instance: any; modelAdapter: string; adapters: any[]; demoLog: string[];
  allSuccess: boolean; canExport: boolean; error: string; viewMode: 'form' | 'canvas';
  onCreateDemo: () => void; onSelectTemplate: (id: string) => void; onCreateBatch: () => void;
  onGenerate: () => void; onMerge: () => void; onApproveAll: () => void; onExport: () => void;
  onSetModelAdapter: (k: string) => void; onSetViewMode: (m: 'form' | 'canvas') => void; onClearError: () => void;
  assets?: WorkbenchAsset[]; onUploadAssets?: (files: FileList) => void; onUpdateAssetRole?: (assetId: string, role: string) => void;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; testid?: string }> =
  ({ title, icon, children, testid }) => (
    <div data-testid={testid} className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-2.5 space-y-1.5">{children}</div>
    </div>
  );

const ActionBtn: React.FC<{ testid?: string; onClick: () => void; disabled?: boolean; disabledReason?: string;
  icon?: React.ReactNode; color?: 'purple' | 'blue' | 'green' | 'orange' | 'red'; children: React.ReactNode }> =
  ({ testid, onClick, disabled, disabledReason, icon, color = 'gray', children }) => {
    const colors: Record<string, string> = {
      purple: 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border-purple-700/30',
      blue: 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border-blue-700/30',
      green: 'bg-green-900/30 hover:bg-green-900/50 text-green-300 border-green-700/30',
      orange: 'bg-orange-900/30 hover:bg-orange-900/50 text-orange-300 border-orange-700/30',
      red: 'bg-red-900/30 hover:bg-red-900/50 text-red-300 border-red-700/30',
      gray: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700/20',
    };
    return (
      <button data-testid={testid} onClick={onClick} disabled={disabled}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg w-full text-left transition-all duration-150
          border ${colors[color] || colors.gray} disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="flex-1 truncate">{children}</span>
        {disabled && disabledReason && <span className="text-[9px] text-gray-600 flex-shrink-0 ml-1">{disabledReason}</span>}
      </button>
    );
  };

export const WorkflowSidebar: React.FC<Props> = (p) => (
  <aside data-testid="workflow-sidebar"
    className="h-full flex flex-col bg-[#0a0f1a] border-r border-white/5 text-xs">
    <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
      {p.error && (
        <div data-testid="error-message"
          className="flex items-start gap-2 bg-red-950/30 border border-red-500/20 text-red-300 px-3 py-2 rounded-xl text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="flex-1 break-all">{p.error}</span>
          <button onClick={p.onClearError} className="text-red-400 hover:text-red-300 flex-shrink-0"><X className="w-3 h-3" /></button>
        </div>
      )}

      <SectionCard title="产品素材包" icon={<Package className="w-3 h-3" />} testid="sidebar-section-product">
        <ActionBtn testid="create-demo-product-button" onClick={p.onCreateDemo} color="purple" icon={<Play className="w-3 h-3" />}>
          创建演示产品
        </ActionBtn>
        {p.productId && (
          <div data-testid="product-id" className="text-gray-500 mt-1 text-[9px] truncate">{p.productId}</div>
        )}
        {p.isReady !== undefined && (
          <div data-testid={p.isReady ? 'checklist-ready' : 'checklist-not-ready'}
            className={`text-[10px] font-medium px-2 py-1 rounded-lg border ${p.isReady ? 'text-green-400 bg-green-900/20 border-green-500/20' : 'text-yellow-400 bg-yellow-900/20 border-yellow-500/20'}`}>
            checklist: {p.isReady ? 'ready' : 'not ready'}
          </div>
        )}
      </SectionCard>

      <SectionCard title="视频模板" icon={<FileVideo className="w-3 h-3" />} testid="sidebar-section-template">
        {p.templates.map(t => (
          <button key={t.template_id} data-testid={`template-${t.product_type}`}
            onClick={() => p.onSelectTemplate(t.template_id)}
            className={`block text-[11px] px-2.5 py-1.5 rounded-lg w-full text-left transition-colors border ${p.selTemplateId === t.template_id ? 'bg-purple-900/30 text-purple-300 border-purple-700/40' : 'bg-transparent text-gray-500 border-transparent hover:bg-white/5 hover:text-gray-300'}`}>
            {t.template_name}
          </button>
        ))}
        {p.selTemplateId && (
          <div data-testid="selected-template-id" className="text-gray-600 mt-1 text-[9px] truncate">已选择: {p.selTemplateId}</div>
        )}
      </SectionCard>

      <SectionCard title="视频批次" icon={<Layers className="w-3 h-3" />} testid="sidebar-section-batch">
        <ActionBtn testid="create-video-batch-button" onClick={p.onCreateBatch} color="blue" disabled={!p.isReady || !p.selTemplateId}
          disabledReason={!p.isReady ? '请先完成前置步骤' : !p.selTemplateId ? '请先选择模板' : undefined}
          icon={<Layers className="w-3 h-3" />}>
          创建视频批次
        </ActionBtn>
        {p.batchId && <div data-testid="batch-id" className="text-gray-500 mt-1 text-[9px] truncate">batch_id: {p.batchId}</div>}
        {p.instance && <div data-testid="instance-id" className="text-gray-500 text-[9px] truncate">instance_id: {p.instance.instance_id}</div>}
        {p.batchId && (
          <ActionBtn testid="generate-batch-button" onClick={p.onGenerate} color="green" icon={<Play className="w-3 h-3" />}>
            生成视频批次
          </ActionBtn>
        )}
      </SectionCard>

      <SectionCard title="模型适配器" icon={<Cpu className="w-3 h-3" />}>
        <div data-testid="model-settings-panel" className="space-y-1.5">
          <select data-testid="model-adapter-select" value={p.modelAdapter} onChange={e => p.onSetModelAdapter(e.target.value)}
            className="bg-[#0a0f1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-300 text-xs w-full focus:outline-none focus:border-purple-500/50 transition-colors">
            {(p.adapters || []).map((a: any) => (
              <option key={a.adapter_key} value={a.adapter_key} disabled={!a.configured}>{a.adapter_key}{!a.configured ? ' (未配置)' : ''}</option>
            ))}
          </select>
          <div data-testid="model-adapter-status-mock" className="text-green-400 text-[10px] flex items-center gap-1.5 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> mock：ready
          </div>
          <div data-testid="model-adapter-status-external_http" className="text-gray-600 text-[10px] flex items-center gap-1.5 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> external_http：未配置
          </div>
          <div data-testid="selected-model-adapter" className="text-gray-600 text-[9px] px-1">当前：{p.modelAdapter}</div>
        </div>
      </SectionCard>

      {/* 图片素材包 */}
      <SectionCard title="图片素材包" icon={<Image className="w-3 h-3" />} testid="sidebar-section-assets">
        <div data-testid="asset-library-panel" className="space-y-1.5">
          <label className="flex items-center justify-center gap-1.5 bg-purple-900/20 hover:bg-purple-900/40 text-purple-300 text-xs px-2.5 py-2 rounded-lg w-full cursor-pointer transition-colors border border-dashed border-purple-700/30">
            <Upload className="w-3 h-3" />
            <span>上传图片素材</span>
            <input data-testid="asset-upload-input" type="file" accept="image/*" multiple className="hidden"
              onChange={e => { if (e.target.files && p.onUploadAssets) p.onUploadAssets(e.target.files); e.target.value = ''; }} />
          </label>
          {(p.assets || []).length === 0 ? (
            <div className="text-gray-600 text-[10px] text-center py-2">暂无素材<br/>请先上传用于图生视频的参考图片</div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(p.assets || []).map(a => (
                <div key={a.id} data-testid={`asset-card-${a.id}`} draggable onDragStart={e => { e.dataTransfer.setData('application/workbench-asset', JSON.stringify(a)); e.dataTransfer.effectAllowed = 'move'; }}
                  className="flex items-center gap-2 bg-[#0a0f1a] border border-white/5 rounded-lg p-1.5 cursor-grab active:cursor-grabbing hover:border-purple-500/30 transition-colors">
                  <img src={a.url} alt={a.filename} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-300 truncate">{a.filename}</div>
                    <select value={a.role} onChange={e => p.onUpdateAssetRole?.(a.id, e.target.value)}
                      className="bg-transparent text-[9px] text-gray-500 border-none p-0 focus:outline-none">
                      <option value="product">产品图</option>
                      <option value="scene">场景图</option>
                      <option value="start_frame">首帧图</option>
                      <option value="end_frame">尾帧图</option>
                      <option value="reference">参考图</option>
                      <option value="logo">Logo</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {p.instance && p.allSuccess && (
        <SectionCard title="操作" icon={<CheckCheck className="w-3 h-3" />} testid="sidebar-section-actions">
          <ActionBtn testid="merge-preview-button" onClick={p.onMerge} color="purple" icon={<Eye className="w-3 h-3" />}>
            合并预览
          </ActionBtn>
          {p.instance.draft_preview_url && (
            <div data-testid="draft-preview-url" className="text-green-400 text-[9px] break-all px-1 py-1 bg-green-900/10 rounded-lg border border-green-500/10">{p.instance.draft_preview_url}</div>
          )}
          <div data-testid="instance-review-status" className="text-gray-500 text-[10px] px-1">
            审核状态: {p.instance.review_status || '-'}
          </div>
          <ActionBtn testid="approve-all-button" onClick={p.onApproveAll} color="green" icon={<CheckCheck className="w-3 h-3" />}>
            全部通过
          </ActionBtn>
          <ActionBtn testid="export-button" onClick={p.onExport} color="orange" disabled={!p.canExport}
            disabledReason={!p.canExport ? '审核未通过' : undefined}
            icon={<Download className="w-3 h-3" />}>
            导出
          </ActionBtn>
          {p.instance.final_video_url && (
            <div data-testid="final-video-url" className="text-green-400 text-[9px] break-all px-1 py-1 bg-green-900/10 rounded-lg border border-green-500/10">{p.instance.final_video_url}</div>
          )}
        </SectionCard>
      )}

      <div className="flex gap-1 bg-[#111827] border border-white/5 rounded-xl p-1">
        <button data-testid="workbench-tab-form" onClick={() => p.onSetViewMode('form')}
          className="flex-1 text-[10px] py-1 rounded-lg transition-colors bg-transparent text-gray-600 hover:text-gray-400">表单</button>
        <button data-testid="workbench-tab-canvas" onClick={() => p.onSetViewMode('canvas')}
          className="flex-1 text-[10px] py-1 rounded-lg transition-colors bg-purple-600/30 text-purple-300 border border-purple-500/30">画布</button>
      </div>
    </div>

    <div className="flex-shrink-0 p-3 border-t border-white/5 bg-[#0d1117]">
      <DemoStepLog demoLog={p.demoLog} />
    </div>
  </aside>
);
