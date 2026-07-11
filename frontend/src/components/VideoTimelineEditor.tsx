import React, { useState, useCallback } from 'react';
import { GripVertical, Clock } from 'lucide-react';
import { useCompositionState } from '../hooks/useCompositionState';

interface TimelineShot {
  shotKey: string;
  name: string;
  versionLabel?: string;
  reviewStatus: string;
  provider?: string;
  model?: string;
  duration: number;
}

interface Props {
  shots: TimelineShot[];
  onReorder?: (orderedKeys: string[]) => void;
  compositionOrder?: string[];
  instanceId?: string;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> =
  ({ title, icon, children }) => (
    <div className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d1117]">
        <span className="text-gray-500">{icon}</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-2.5 space-y-1.5">{children}</div>
    </div>
  );

export const VideoTimelineEditor: React.FC<Props> = ({ shots, onReorder, compositionOrder, instanceId }) => {
  const { durations, updateDurations } = useCompositionState(instanceId || '');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const orderedShots = (compositionOrder && compositionOrder.length > 0)
    ? compositionOrder.filter(k => shots.some(s => s.shotKey === k)).map(k => shots.find(s => s.shotKey === k)!)
    : shots;

  // Compute cumulative start times for timeline display
  let runningTotal = 0;
  const cumTimes = orderedShots.map(s => {
    const d = durations[s.shotKey] || s.duration || 4;
    const start = runningTotal;
    runningTotal += d;
    return { shotKey: s.shotKey, start, duration: d };
  });
  const totalDuration = runningTotal;

  const saveDurations = useCallback((sk: string, val: number) => {
    const next = { ...durations, [sk]: val };
    updateDurations(next);
  }, [durations, updateDurations]);

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...orderedShots];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setDragIdx(idx);
    onReorder?.(reordered.map(s => s.shotKey));
  };

  const handleDragEnd = () => setDragIdx(null);

  return (
    <SectionCard title="时间线" icon={<Clock className="w-3 h-3" />}>
      <div data-testid="video-timeline-editor" className="space-y-1">
        {orderedShots.map((s, i) => {
          const dur = durations[s.shotKey] || s.duration || 4;
          const ct = cumTimes[i];
          return (
            <div key={s.shotKey} data-testid={`timeline-shot-${s.shotKey}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 text-[9px] bg-[#0a0f1a] border rounded px-2 py-1 cursor-grab active:cursor-grabbing transition-colors ${dragIdx === i ? 'border-purple-500/40 bg-purple-900/10' : 'border-white/5'}`}>
              <GripVertical className="w-3 h-3 text-gray-600 flex-shrink-0" />
              <span className="text-gray-500 w-4 text-center flex-shrink-0">{i + 1}</span>
              <span className="text-gray-400 w-16 flex-shrink-0">{s.shotKey}</span>
              <span className="text-gray-600 text-[8px] w-20 flex-shrink-0">{ct.start}s - {ct.start + ct.duration}s</span>
              <input
                type="number"
                data-testid={`timeline-duration-${s.shotKey}`}
                value={dur}
                min={1} max={30}
                onChange={e => saveDurations(s.shotKey, parseInt(e.target.value) || 4)}
                className="w-10 text-center bg-[#0d1117] border border-white/10 rounded px-1 py-0.5 text-gray-200 text-[9px]"
              />
              <span className="text-gray-600 text-[8px]">秒</span>
              <span className={`text-[8px] px-1 py-0.5 rounded-full border ${s.reviewStatus === 'approved' ? 'bg-green-900/30 text-green-400 border-green-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'}`}>
                {s.reviewStatus === 'approved' ? '✓' : '⏳'}
              </span>
            </div>
          );
        })}
        <div data-testid="timeline-total-duration" className="text-[9px] text-gray-400 text-right pt-1 border-t border-white/5">
          总时长: {totalDuration}秒
        </div>
      </div>
    </SectionCard>
  );
};
