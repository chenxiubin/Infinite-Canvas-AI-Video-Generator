import React from 'react';
import { CheckCircle, XCircle, Loader2, Circle } from 'lucide-react';

const STEPS = [
  { key: 'product created', label: '创建产品', testid: 'demo-progress-step-product' },
  { key: 'assets registered', label: '注册素材', testid: 'demo-progress-step-assets' },
  { key: 'checklist ready', label: '前置检查就绪', testid: 'demo-progress-step-checklist' },
  { key: 'batch created', label: '创建批次', testid: 'demo-progress-step-batch' },
  { key: 'generated success', label: '模拟生成', testid: 'demo-progress-step-generate' },
  { key: 'preview generated', label: '草稿预览', testid: 'demo-progress-step-preview' },
  { key: 'review approved', label: '全部通过', testid: 'demo-progress-step-review' },
  { key: 'mock export completed', label: '导出', testid: 'demo-progress-step-export' },
];

interface Props { demoLog: string[] }

export const DemoStepLog: React.FC<Props> = ({ demoLog }) => {
  if (demoLog.length === 0) return null;
  const last = demoLog[demoLog.length - 1];
  const isError = last?.startsWith('ERROR');

  return (
    <div data-testid="demo-step-log" className="space-y-0.5">
      <div className="text-gray-400 text-[10px] font-medium mb-1">演示进度</div>
      {STEPS.map((s, i) => {
        const found = demoLog.some(l => l.includes(s.key));
        const status = found ? (isError && i === STEPS.length - 1 ? 'failed' : 'success') : 'pending';
        return (
          <div key={s.key} data-testid={s.testid} className="flex items-center gap-1.5 text-[10px]">
            {status === 'success' ? <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
             : status === 'failed' ? <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
             : <Circle className="w-3 h-3 text-gray-700 flex-shrink-0" />}
            <span className={status === 'success' ? 'text-gray-300' : status === 'failed' ? 'text-red-400' : 'text-gray-600'}>{s.label}</span>
          </div>
        );
      })}
      {last === 'mock export completed' && <div data-testid="demo-complete-message" className="text-green-400 font-medium text-[10px] mt-1">演示完成</div>}
      {isError && <div className="text-red-400 text-[10px] mt-1">演示失败</div>}
      {demoLog.map((m, i) => <span key={i} style={{ display: 'none' }}>{m}</span>)}
    </div>
  );
};
