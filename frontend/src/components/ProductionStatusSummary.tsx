import React from 'react';
import { Activity } from 'lucide-react';

interface Props {
  productId: string;
  checklist: any;
  selTemplateId: string;
  batchId: string;
  batchStatus: string;
  nodes: any[];
  instance: any;
}

function statusColor(done: boolean, active: boolean): { dot: string; text: string } {
  if (done) return { dot: 'bg-green-400', text: 'text-green-300' };
  if (active) return { dot: 'bg-amber-400', text: 'text-amber-200' };
  return { dot: 'bg-gray-600', text: 'text-gray-500' };
}

export const ProductionStatusSummary: React.FC<Props> = ({
  productId, checklist, selTemplateId, batchId, batchStatus, nodes, instance,
}) => {
  const ready = checklist?.is_ready;
  const nodeStatuses = nodes.map(n => n.status);
  const successCount = nodeStatuses.filter(s => s === 'success').length;
  const failedCount = nodeStatuses.filter(s => s === 'failed').length;

  // --- asset / product ---
  const assetDone = !!(productId && ready);
  const assetActive = !!productId && !ready;
  const assetVal = productId ? (ready ? 'ready' : 'incomplete') : '未创建';

  // --- template ---
  const templateDone = !!selTemplateId;
  const templateActive = false;
  const templateVal = selTemplateId ? 'selected' : '未选择';

  // --- batch ---
  const batchDone = !!(batchId && (batchStatus === 'completed' || batchStatus === 'success'));
  const batchActive = !!batchId && batchStatus && !batchDone;
  const batchVal = batchId ? (batchStatus || 'ready') : '未创建';

  // --- generate / nodes ---
  const generateDone = nodes.length > 0 && failedCount === 0;
  const generateActive = nodes.length > 0 && failedCount > 0;
  const generateVal = nodes.length > 0
    ? `${successCount}/${nodes.length} success${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
    : '未生成';

  // --- review ---
  const reviewRaw = instance?.review_status || (nodes.length > 0 ? 'not_ready' : null);
  const reviewVal = instance?.review_status || (nodes.length > 0 ? 'not_ready' : '未开始');
  const reviewDone = reviewRaw === 'approved';
  const reviewActive = !reviewDone && (reviewRaw === 'not_ready' || reviewRaw === 'pending' || reviewRaw === 'in_progress');

  // --- export ---
  const exportDone = !!(instance?.final_video_url || instance?.export_status === 'success');
  const exportActive = !!instance?.export_status && instance?.export_status !== 'success';
  const exportVal = instance?.final_video_url ? 'success' : (instance?.export_status || '未开始');

  const steps = [
    { key: 'assets',    testid: 'production-status-step-assets',    label: 'assets',    ...statusColor(assetDone, assetActive),      val: assetVal },
    { key: 'template',  testid: 'production-status-step-template',  label: 'template',  ...statusColor(templateDone, templateActive),  val: templateVal },
    { key: 'batch',     testid: 'production-status-step-batch',     label: 'batch',     ...statusColor(batchDone, batchActive),       val: batchVal },
    { key: 'generate',  testid: 'production-status-step-generate',  label: 'generate',  ...statusColor(generateDone, generateActive),  val: generateVal },
    { key: 'review',    testid: 'production-status-step-review',    label: 'review',    ...statusColor(reviewDone, reviewActive),      val: reviewVal },
    { key: 'export',    testid: 'production-status-step-export',    label: 'export',    ...statusColor(exportDone, exportActive),      val: exportVal },
  ];

  return (
    <div
      data-testid="production-status-summary"
      className="flex items-center h-9 px-3 bg-[#0f172a] border-b border-white/5 gap-3"
    >
      <Activity className="w-3 h-3 text-purple-400 flex-shrink-0" />

      {/* preserve old card-level testids as hidden spans */}
      <span data-testid="production-status-compact" className="hidden" />
      <span data-testid="summary-product-status" className="hidden">{assetVal}</span>
      <span data-testid="summary-template-status" className="hidden">{templateVal}</span>
      <span data-testid="summary-batch-status" className="hidden">{batchVal}</span>
      <span data-testid="summary-node-status" className="hidden">{generateVal}</span>
      <span data-testid="summary-review-status" className="hidden">{reviewVal}</span>
      <span data-testid="summary-export-status" className="hidden">{exportVal}</span>

      <div className="flex items-center gap-0 flex-1 min-w-0">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <div data-testid={s.testid} className="flex items-center gap-1.5 px-2">
              <span className={`w-2 h-2 rounded-full ${s.dot} flex-shrink-0`} />
              <span className={`text-[10px] leading-tight ${s.text} whitespace-nowrap`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className="w-px h-3 bg-white/10 flex-shrink-0" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
