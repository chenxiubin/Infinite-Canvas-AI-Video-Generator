import React from 'react';
import { Activity, Package, FileVideo, Layers, Image, CheckCheck, Download } from 'lucide-react';

interface Props {
  productId: string;
  checklist: any;
  selTemplateId: string;
  batchId: string;
  batchStatus: string;
  nodes: any[];
  instance: any;
}

interface StatusCardDef { label: string; value: string; testid: string; icon: React.ReactNode; }

function StatusCard({ label, value, testid, icon }: StatusCardDef) {
  const isGood = value.includes('ready') || value.includes('success') || value.includes('completed')
    || value.includes('approved') || value.includes('selected') || value.includes('exported');
  const isBad = value.includes('failed') || value.includes('rejected');
  const cls = isGood ? 'border-green-500/30 bg-green-900/15' : isBad ? 'border-red-500/30 bg-red-900/15' : 'border-white/5 bg-[#111827]';
  return (
    <div data-testid={testid} className={`flex items-center gap-2.5 border rounded-lg px-3 py-2.5 ${cls} transition-colors`}>
      <span className={`flex-shrink-0 ${isGood ? 'text-green-400' : isBad ? 'text-red-400' : 'text-gray-600'}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-gray-500 mb-0.5 truncate">{label}</div>
        <div className="text-[11px] text-gray-200 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

export const ProductionStatusSummary: React.FC<Props> = ({
  productId, checklist, selTemplateId, batchId, batchStatus, nodes, instance,
}) => {
  const ready = checklist?.is_ready;
  const nodeStatuses = nodes.map(n => n.status);
  const successCount = nodeStatuses.filter(s => s === 'success').length;
  const failedCount = nodeStatuses.filter(s => s === 'failed').length;

  return (
    <div data-testid="production-status-summary" className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Activity className="w-3.5 h-3.5 text-purple-400" />
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">生产状态</h2>
      </div>
      <div className="grid grid-cols-6 gap-2">
        <StatusCard label="产品素材包" testid="summary-product-status"
          value={productId ? (ready ? 'ready' : 'incomplete') : '未创建'}
          icon={<Package className="w-3.5 h-3.5" />} />
        <StatusCard label="视频模板" testid="summary-template-status"
          value={selTemplateId ? 'selected' : '未选择'}
          icon={<FileVideo className="w-3.5 h-3.5" />} />
        <StatusCard label="批次" testid="summary-batch-status"
          value={batchId ? batchStatus || 'ready' : '未创建'}
          icon={<Layers className="w-3.5 h-3.5" />} />
        <StatusCard label="节点生成" testid="summary-node-status"
          value={nodes.length > 0 ? `${successCount}/${nodes.length} success${failedCount > 0 ? ` (${failedCount} failed)` : ''}` : '未生成'}
          icon={<Image className="w-3.5 h-3.5" />} />
        <StatusCard label="审核" testid="summary-review-status"
          value={instance?.review_status || (nodes.length > 0 ? 'not_ready' : '未开始')}
          icon={<CheckCheck className="w-3.5 h-3.5" />} />
        <StatusCard label="导出" testid="summary-export-status"
          value={instance?.final_video_url ? 'success' : instance?.export_status || '未开始'}
          icon={<Download className="w-3.5 h-3.5" />} />
      </div>
    </div>
  );
};
