/**
 * Unified production state store — instance-scoped.
 *
 * All state is namespaced by instanceId under a single localStorage key
 * `productionStateByInstance`.  Each instance has its own independent
 * compositionOrder / timelineDurations / compositionJob / finalVideoVersions.
 */

const STORE_KEY = 'productionStateByInstance';

interface InstanceState {
  compositionOrder: string[];
  timelineDurations: Record<string, number>;
  compositionJob: CompositionJob;
  finalVideoVersions: FinalVideoVersion[];
  currentFinalVideoId: string;
}

function readAll(): Record<string, InstanceState> {
  try { const v = localStorage.getItem(STORE_KEY); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}
function writeAll(all: Record<string, InstanceState>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch {}
}
function readInstance(iid: string): InstanceState {
  return readAll()[iid] || {
    compositionOrder: [],
    timelineDurations: {},
    compositionJob: { status: 'idle' },
    finalVideoVersions: [],
    currentFinalVideoId: '',
  };
}
function writeInstance(iid: string, s: InstanceState): void {
  const all = readAll();
  all[iid] = s;
  writeAll(all);
}

// ── compositionOrder ──
export function getCompositionOrder(iid: string): string[] {
  return readInstance(iid).compositionOrder;
}
export function setCompositionOrder(iid: string, order: string[]): void {
  const s = readInstance(iid); s.compositionOrder = order; writeInstance(iid, s);
}

// ── timelineDurations ──
export function getTimelineDurations(iid: string): Record<string, number> {
  return readInstance(iid).timelineDurations;
}
export function setTimelineDurations(iid: string, d: Record<string, number>): void {
  const s = readInstance(iid); s.timelineDurations = d; writeInstance(iid, s);
}

// ── compositionJob ──
export interface CompositionJob {
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  startedAt?: number; completedAt?: number; errorMessage?: string;
}
export function getCompositionJob(iid: string): CompositionJob {
  return readInstance(iid).compositionJob;
}
export function setCompositionJob(iid: string, job: CompositionJob): void {
  const s = readInstance(iid); s.compositionJob = job; writeInstance(iid, s);
}

// ── finalVideoVersions ──
export interface FinalVideoVersion {
  versionId: string; videoUrl: string; createdAt: number;
  status: 'completed' | 'failed'; errorMessage?: string;
}
export function getFinalVideoVersions(iid: string): FinalVideoVersion[] {
  return readInstance(iid).finalVideoVersions;
}
export function setFinalVideoVersions(iid: string, versions: FinalVideoVersion[]): void {
  const s = readInstance(iid); s.finalVideoVersions = versions; writeInstance(iid, s);
}

// ── currentFinalVideoId ──
export function getCurrentFinalVideoId(iid: string): string {
  return readInstance(iid).currentFinalVideoId;
}
export function setCurrentFinalVideoId(iid: string, id: string): void {
  const s = readInstance(iid); s.currentFinalVideoId = id; writeInstance(iid, s);
}

// ── convenience ──
export function getInstanceStateSummary(iid: string): InstanceState {
  return readInstance(iid);
}
