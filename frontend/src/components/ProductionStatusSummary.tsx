import React from 'react';

interface Props {
  productId: string;
  checklist: any;
  selTemplateId: string;
  batchId: string;
  batchStatus: string;
  nodes: any[];
  instance: any;
}

function Card({ label, value, testid }: { label: string; value: string; testid: string }) {
  const isGood = value.includes('ready') || value.includes('success') || value.includes('completed') || value.includes('approved') || value.includes('selected') || value.includes('exported');
  const isBad = value.includes('failed') || value.includes('rejected');
  const cls = isGood ? 'border-green-500/50 bg-green-900/20' : isBad ? 'border-red-500/50 bg-red-900/20' : 'border-white/10 bg-[#0f172a]';
  return (
    <div data-testid={testid} className={`border rounded px-3 py-2 text-xs ${cls}`}>
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className="text-gray-200 font-medium">{value}</div>
    </div>
  );
}

export const ProductionStatusSummary: React.FC<Props> = ({ productId, checklist, selTemplateId, batchId, batchStatus, nodes, instance }) => {
  const ready = checklist?.is_ready;
  const nodeStatuses = nodes.map(n => n.status);
  const successCount = nodeStatuses.filter(s => s === 'success').length;
  const failedCount = nodeStatuses.filter(s => s === 'failed').length;
  const pendingCount = nodeStatuses.filter(s => s === 'pending' || s === 'running').length;

  return (
    <div data-testid="production-status-summary" className="bg-[#1e293b] border border-white/10 rounded-lg p-4 mb-4">
      <h2 className="text-sm font-semibold mb-3">生产状态总览</h2>
      <div className="grid grid-cols-3 gap-3">
        <Card label="产品素材包" testid="summary-product-status"
          value={productId ? (ready ? 'ready' : 'incomplete') : '未创建'} />
        <Card label="视频模板" testid="summary-template-status"
          value={selTemplateId ? 'selected' : '未选择'} />
        <Card label="批次" testid="summary-batch-status"
          value={batchId ? batchStatus || 'ready' : '未创建'} />
        <Card label="节点生成" testid="summary-node-status"
          value={nodes.length > 0 ? `${successCount}/${nodes.length} success` + (failedCount > 0 ? ` (${failedCount} failed)` : '') : '未生成'} />
        <Card label="审核" testid="summary-review-status"
          value={instance?.review_status || (nodes.length > 0 ? 'not_ready' : '未开始')} />
        <Card label="导出" testid="summary-export-status"
          value={instance?.final_video_url ? 'success' : instance?.export_status || '未开始'} />
      </div>
    </div>
  );
};
