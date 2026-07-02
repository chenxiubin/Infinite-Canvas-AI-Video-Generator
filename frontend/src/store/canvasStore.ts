import { create } from 'zustand';
import { type Node, type Edge, type Connection, addEdge } from '@xyflow/react';

export type NodeStatus = 'pending' | 'generating' | 'success' | 'failed';
export type AIGenCandidateStatus = 'not_triggered' | 'candidates_generating' | 'pending_selection' | 'locked';

export interface NodeData {
  label: string;
  roleKey?: string;
  roleName?: string;
  nodeType: 'asset' | 'generation' | 'shot' | 'merge';
  isFixed?: boolean;
  status: NodeStatus;
  duration: number; // in seconds
  shotSize?: string;
  cameraMove?: string;
  lightingMood?: string;
  motionIntensity?: string;
  textLockEnabled?: boolean;
  boundAssetUrl?: string;
  boundAssetSource?: 'uploaded' | 'generated';
  boundAssetRoleKey?: string;
  aiCandidateStatus?: AIGenCandidateStatus;
  aiCandidates?: { id: string; url: string }[];
  selectedCandidateId?: string;
}

export interface UnrecognizedAsset {
  filename: string;
  url: string;
  reason: string;
}

export interface BatchTaskItem {
  id: string;
  instance_id: string;
  product_sku: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error_message?: string;
}

export interface BatchTask {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_count: number;
  completed_count: number;
  failed_count: number;
  items: BatchTaskItem[];
}

interface CanvasState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  productLine: 'hanging' | 'desk';
  totalDuration: number;
  isMerging: boolean;
  mergedVideoUrl: string | null;
  
  // Backend Integration State
  isOfflineMode: boolean;
  canvasId: string | null;
  instanceId: string | null;
  productSku: string | null;
  setInstanceId: (id: string) => void;

  // Actions
  initWorkspace: () => Promise<void>;
  setNodes: (nodes: Node<NodeData>[] | ((nds: Node<NodeData>[]) => Node<NodeData>[])) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: Connection) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeStatus: (id: string, status: NodeStatus) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  bindAsset: (nodeId: string, assetUrl: string, source: 'uploaded' | 'generated', assetRoleKey?: string) => void;
  uploadAndBindAsset: (nodeId: string, file: File) => Promise<void>;
  setProductLine: (line: 'hanging' | 'desk') => Promise<void>;
  saveTemplate: (name: string) => Promise<string>;
  loadTemplate: (templateId: string) => Promise<void>;
  calculateTotalDuration: () => void;

  // Sprint 3: Multi-select & Batch Clone
  selectedAssetIds: Set<string>;
  toggleAssetSelection: (assetId: string) => void;
  clearAssetSelection: () => void;
  batchCloneInstances: (assets: { id: string; filename: string; url: string }[]) => Promise<{ 
    batch_id: string;
    instances: { instance_id: string; product_sku: string; missing_roles: string[] }[]; 
    unrecognized_assets: UnrecognizedAsset[];
  }>;
  pendingAssets: UnrecognizedAsset[];
  setPendingAssets: (assets: UnrecognizedAsset[]) => void;
  removePendingAsset: (filename: string) => void;

  // Sprint 4: Batch Task Dashboard
  activeBatchTask: BatchTask | null;
  generateBatch: (batchId: string) => Promise<void>;
  pollBatchTask: (batchId: string) => void;

  // Mock generation flows
  triggerMockGeneration: (nodeId: string) => void;
  triggerAIGenerateCandidates: (nodeId: string) => void;
  selectAICandidate: (nodeId: string, candidateId: string) => void;
  triggerMockMerge: () => void;
  resetAll: () => void;
}

const BACKEND_URL = "http://127.0.0.1:8000";

const initialHangingNodes: Node<NodeData>[] = [
  {
    id: 'S01_main',
    type: 'custom',
    position: { x: 50, y: 150 },
    data: {
      label: 'S01 主图镜头',
      roleKey: 'main',
      roleName: '主图-正面',
      nodeType: 'shot',
      isFixed: false,
      status: 'pending',
      duration: 4,
      shotSize: '中景',
      cameraMove: '推',
      lightingMood: '暖光节日氛围',
      motionIntensity: '轻微',
      textLockEnabled: false,
    },
  },
  {
    id: 'S02_detail1',
    type: 'custom',
    position: { x: 300, y: 150 },
    data: {
      label: 'S02 细节特写1',
      roleKey: 'detail_1',
      roleName: '细节-纸张质感',
      nodeType: 'shot',
      isFixed: false,
      status: 'pending',
      duration: 3,
      shotSize: '特写',
      cameraMove: '摇',
      lightingMood: '侧光质感',
      motionIntensity: '中等',
      textLockEnabled: false,
    },
  },
  {
    id: 'S03_detail2',
    type: 'custom',
    position: { x: 550, y: 150 },
    data: {
      label: 'S03 细节特写2',
      roleKey: 'detail_2',
      roleName: '细节-装订挂绳',
      nodeType: 'shot',
      isFixed: false,
      status: 'pending',
      duration: 3,
      shotSize: '特写',
      cameraMove: '拉',
      lightingMood: '暖光节日氛围',
      motionIntensity: '轻微',
      textLockEnabled: false,
    },
  },
  {
    id: 'S04_motion',
    type: 'custom',
    position: { x: 800, y: 150 },
    data: {
      label: 'S04 运镜展示',
      roleKey: 'motion',
      roleName: '运镜-整体悬挂摇镜',
      nodeType: 'shot',
      isFixed: false,
      status: 'pending',
      duration: 5,
      shotSize: '全景',
      cameraMove: '摇',
      lightingMood: '自然光',
      motionIntensity: '较大',
      textLockEnabled: false,
    },
  },
  {
    id: 'S05_scene',
    type: 'custom',
    position: { x: 1050, y: 150 },
    data: {
      label: 'S05 场景镜头',
      roleKey: 'scene',
      roleName: '场景-墙面陈列',
      nodeType: 'shot',
      isFixed: false,
      status: 'pending',
      duration: 5,
      shotSize: '中远景',
      cameraMove: '移',
      lightingMood: '自然光',
      motionIntensity: '轻微',
      textLockEnabled: false,
    },
  },
  {
    id: 'S06_brand',
    type: 'custom',
    position: { x: 1300, y: 150 },
    data: {
      label: 'S06 品牌尾帧',
      roleKey: 'brand_end',
      roleName: '尾帧-LOGO',
      nodeType: 'shot',
      isFixed: true,
      status: 'success',
      duration: 4,
      shotSize: '全景',
      cameraMove: '静止',
      lightingMood: '演播室',
      motionIntensity: '轻微',
      textLockEnabled: false,
      boundAssetUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80',
      boundAssetSource: 'uploaded',
    },
  },
  {
    id: 'M01_merge',
    type: 'custom',
    position: { x: 1550, y: 150 },
    data: {
      label: 'M01 视频合成',
      nodeType: 'merge',
      status: 'pending',
      duration: 0,
    },
  },
  {
    id: 'AI01_gen',
    type: 'custom',
    position: { x: 50, y: -100 },
    data: {
      label: 'AI 辅助生成 (S01)',
      roleKey: 'main_ai',
      nodeType: 'generation',
      status: 'pending',
      duration: 0,
      aiCandidateStatus: 'not_triggered',
    },
  },
];

const initialHangingEdges: Edge[] = [
  { id: 'e1-2', source: 'S01_main', target: 'S02_detail1', animated: false },
  { id: 'e2-3', source: 'S02_detail1', target: 'S03_detail2', animated: false },
  { id: 'e3-4', source: 'S03_detail2', target: 'S04_motion', animated: false },
  { id: 'e4-5', source: 'S04_motion', target: 'S05_scene', animated: false },
  { id: 'e5-6', source: 'S05_scene', target: 'S06_brand', animated: false },
  { id: 'e6-7', source: 'S06_brand', target: 'M01_merge', animated: false },
  { id: 'e-ai-1', source: 'AI01_gen', target: 'S01_main', animated: true, style: { strokeDasharray: '5,5', stroke: '#f472b6' } },
];

// Helper: extract real node_key from a potentially instance-suffixed nodeId
// e.g. 'S02_detail1_ins_abc123' -> 'S02_detail1'
// e.g. 'S02_detail1' -> 'S02_detail1'
function resolveNodeKey(nodeId: string): string {
  const insIndex = nodeId.lastIndexOf('_ins_');
  return insIndex > 0 ? nodeId.substring(0, insIndex) : nodeId;
}

// Helper: extract instance_id from a suffixed nodeId
// e.g. 'S02_detail1_ins_abc123' -> 'ins_abc123'
// e.g. 'S02_detail1' -> null
function resolveInstanceIdFromNode(nodeId: string): string | null {
  const match = nodeId.match(/_ins_([a-f0-9]+)$/);
  return match ? `ins_${match[1]}` : null;
}

const getDeskLocalNodes = (): Node<NodeData>[] => {
  return initialHangingNodes.map((n) => {
    if (n.id === 'S03_detail2') {
      return {
        ...n,
        data: {
          ...n.data,
          label: 'S03 细节特写2',
          roleName: '底座/翻页装订结构',
          cameraMove: '拉',
        },
      };
    }
    if (n.id === 'S04_motion') {
      return {
        ...n,
        data: {
          ...n.data,
          label: 'S04 运镜展示',
          roleName: '手部翻页动作 + 桌面平移',
          cameraMove: '平移',
        },
      };
    }
    if (n.id === 'S05_scene') {
      return {
        ...n,
        data: {
          ...n.data,
          label: 'S05 场景镜头',
          roleName: '书桌/办公场景陈列',
          cameraMove: '移',
        },
      };
    }
    return n;
  });
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initialHangingNodes,
  edges: initialHangingEdges,
  selectedNodeId: null,
  productLine: 'hanging',
  totalDuration: 24,
  isMerging: false,
  mergedVideoUrl: null,
  
  // Backend flags
  isOfflineMode: true,
  canvasId: null,
  instanceId: null,
  productSku: 'SKU2027-A01',

  // Sprint 3: Multi-select state
  selectedAssetIds: new Set<string>(),

  toggleAssetSelection: (assetId) => {
    set((state) => {
      const next = new Set(state.selectedAssetIds);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return { selectedAssetIds: next };
    });
  },

  clearAssetSelection: () => {
    set({ selectedAssetIds: new Set<string>() });
  },

  batchCloneInstances: async (assets) => {
    const { canvasId, isOfflineMode, productLine, nodes: existingNodes, edges } = get();
    const templateId = productLine === 'hanging' ? 'tpl_hanging' : 'tpl_desk';

    if (isOfflineMode || !canvasId) {
      // Offline fallback: simulate one instance per guessed SKU
      const groups: Record<string, typeof assets> = {};
      for (const a of assets) {
        const stem = a.filename.replace(/\.[^.]+$/, '');
        const sku = stem.includes('_') ? stem.split('_').slice(0, -1).join('_') : stem;
        if (!groups[sku]) groups[sku] = [];
        groups[sku].push(a);
      }
      return {
        batch_id: 'offline_batch_001',
        instances: Object.keys(groups).map((sku, i) => ({
          instance_id: `offline_ins_${i}`,
          product_sku: sku,
          missing_roles: [],
        })),
        unrecognized_assets: [],
      };
    }

    const resp = await fetch(`${BACKEND_URL}/api/v1/canvases/${canvasId}/instances/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        assets: assets.map(a => ({ filename: a.filename, url: a.url, asset_id: a.id })),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || `Batch clone failed: ${resp.status}`);
    }

    const data = await resp.json();
    const newInstances: { instance_id: string; product_sku: string; missing_roles: string[] }[] = data.instances;
    const unrecognizedAssets: UnrecognizedAsset[] = data.unrecognized_assets || [];

    // Fetch each instance details and lay them out vertically
    const localRefNodes = productLine === 'hanging' ? initialHangingNodes : getDeskLocalNodes();
    const CHAIN_VERTICAL_GAP = 260;
    const allNewNodes: any[] = [];
    const allNewEdges: any[] = [];

    for (let i = 0; i < newInstances.length; i++) {
      const { instance_id } = newInstances[i];
      const detailResp = await fetch(`${BACKEND_URL}/api/v1/instances/${instance_id}`);
      if (!detailResp.ok) continue;
      const detail = await detailResp.json();

      // Find the Y offset: existing chains take up space, new chains stack below
      const baseY = (existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.position.y)) + CHAIN_VERTICAL_GAP
        : 0) + i * CHAIN_VERTICAL_GAP;

      const chainNodes = detail.nodes.map((bNode: any) => {
        const localNode = localRefNodes.find(ln => ln.id === bNode.id);
        return {
          ...bNode,
          id: `${bNode.id}_${instance_id}`, // unique ID per chain
          position: localNode
            ? { x: localNode.position.x, y: localNode.position.y + baseY }
            : { x: 0, y: baseY },
        };
      });

      // Reconstruct edges for this chain
      const chainEdges = edges.map((e, ei) => ({
        ...e,
        id: `${e.id}_${instance_id}_${ei}`,
        source: `${e.source}_${instance_id}`,
        target: `${e.target}_${instance_id}`,
      }));

      allNewNodes.push(...chainNodes);
      allNewEdges.push(...chainEdges);
    }

    // Append new chains to canvas
    if (allNewNodes.length > 0) {
      set((state) => ({
        nodes: [...state.nodes, ...allNewNodes],
        edges: [...state.edges, ...allNewEdges],
      }));
    }

    if (unrecognizedAssets.length > 0) {
      set((state) => ({
        pendingAssets: [...state.pendingAssets, ...unrecognizedAssets]
      }));
    }

    return { 
      batch_id: data.batch_id,
      instances: newInstances, 
      unrecognized_assets: unrecognizedAssets 
    };
  },

  batchPollInterval: null as NodeJS.Timeout | null,
  activeBatchTask: null,
  
  generateBatch: async (batchId: string) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/v1/batches/${batchId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!resp.ok) throw new Error('Generate batch failed');
      get().pollBatchTask(batchId);
    } catch (e) {
      console.error(e);
    }
  },

  pollBatchTask: (batchId: string) => {
    if (get().batchPollInterval) {
      clearInterval(get().batchPollInterval);
    }
    
    // Immediate first fetch
    const fetchStatus = async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/v1/batches/${batchId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        set({ activeBatchTask: data });
        
        // Sync node statuses to canvas for the active instance
        const activeInstanceId = get().instanceId;
        if (data.items) {
          const currentItem = data.items.find((i: any) => i.instance_id === activeInstanceId);
          if (currentItem && currentItem.nodes) {
            // Batch update nodes status
            const currentNodes = get().nodes;
            let updated = false;
            const newNodes = currentNodes.map(n => {
              const bNode = currentItem.nodes.find((bn: any) => n.id === bn.id);
              if (bNode && n.data.status !== bNode.status) {
                updated = true;
                return { ...n, data: { ...n.data, status: bNode.status } };
              }
              return n;
            });
            if (updated) {
              set({ nodes: newNodes });
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    set({ batchPollInterval: interval });
  },

  pendingAssets: [],
  setPendingAssets: (assets) => set({ pendingAssets: assets }),
  removePendingAsset: (filename) => set((state) => ({
    pendingAssets: state.pendingAssets.filter(a => a.filename !== filename)
  })),

  initWorkspace: async () => {
    try {
      // 1. Check if backend is available
      const canvasResp = await fetch(`${BACKEND_URL}/api/v1/canvases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      if (!canvasResp.ok) throw new Error("Backend connection failed");
      
      const { canvas_id } = await canvasResp.json();
      
      // 2. Clone template into product instance
      const instanceResp = await fetch(`${BACKEND_URL}/api/v1/canvases/${canvas_id}/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "tpl_hanging",
          product_sku: "SKU2027-A01"
        })
      });
      
      const { instance_id } = await instanceResp.json();
      
      set({
        isOfflineMode: false,
        canvasId: canvas_id,
        instanceId: instance_id
      });
      
      console.log("🚀 Connected to FastAPI Backend. Running in Sync Mode.");
      
      // Load initial nodes state from backend
      const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${instance_id}`);
      const details = await detailsResp.json();
      
      set({
        productSku: details.product_sku
      });
      
      // Merge positions into backend nodes (backend holds logic state, frontend positions are local)
      const mergedNodes = details.nodes.map((bNode: any) => {
        const localNode = get().nodes.find(ln => ln.id === bNode.id);
        return {
          ...bNode,
          position: localNode ? localNode.position : { x: 0, y: 0 }
        };
      });
      
      set({ nodes: mergedNodes });
      get().calculateTotalDuration();
      
    } catch (e) {
      console.warn("⚠️ Cannot connect to backend. Running in Offline Mock mode.");
      set({ isOfflineMode: true });
    }
  },

  setNodes: (nodes) => {
    set((state) => {
      const nextNodes = typeof nodes === 'function' ? nodes(state.nodes) : nodes;
      return { nodes: nextNodes };
    });
    get().calculateTotalDuration();
  },

  setInstanceId: (id) => {
    set({ instanceId: id });
  },

  setEdges: (edges) => {
    set((state) => {
      const nextEdges = typeof edges === 'function' ? edges(state.edges) : edges;
      return { edges: nextEdges };
    });
  },

  onNodesChange: (changes: any) => {
    set((state) => {
      const updatedNodes = state.nodes.map(node => {
        const change = changes.find((c: any) => c.id === node.id);
        if (change && change.type === 'position' && change.position) {
          return { ...node, position: change.position };
        }
        return node;
      });
      return { nodes: updatedNodes };
    });
  },

  onEdgesChange: (changes: any) => {
    // simplified
  },

  onConnect: (connection: Connection) => {
    set((state) => ({
      edges: addEdge(connection, state.edges),
    }));
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id });
  },

  updateNodeStatus: (id, status) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, status } } : node
      ),
    }));
    
    // Auto-check if merge should be ready
    if (status === 'success') {
      const targetNode = get().nodes.find((n) => n.id === id);
      const isShotNode = targetNode?.data.nodeType === 'shot';
      
      if (isShotNode) {
        const allShotsSuccessful = get().nodes
          .filter((n) => n.data.nodeType === 'shot')
          .every((n) => n.data.status === 'success');
        
        if (allShotsSuccessful) {
          get().triggerMockMerge();
        }
      }
    }
  },

  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
    get().calculateTotalDuration();
  },

  bindAsset: async (nodeId, assetUrl, source, assetRoleKey) => {
    // Local Update
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                boundAssetUrl: assetUrl,
                boundAssetSource: source,
                boundAssetRoleKey: assetRoleKey || undefined,
                status: node.data.status === 'success' ? 'success' : 'pending',
              },
            }
          : node
      ),
    }));

    // Backend Sync if online
    const isOffline = get().isOfflineMode;
    const storeInstanceId = get().instanceId;
    const resolvedInstanceId = resolveInstanceIdFromNode(nodeId) || storeInstanceId;
    const resolvedNodeKey = resolveNodeKey(nodeId);
    if (!isOffline && resolvedInstanceId) {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}/nodes/${resolvedNodeKey}/asset-binding`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: assetUrl, // starts with http, backend binds directly
            source_type: source,
            asset_role_key: assetRoleKey || null
          })
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          console.error("Asset binding failed on backend:", errData.detail || resp.statusText);
        }
      } catch (e) {
        console.error("Failed to sync asset binding to backend", e);
      }
    }
  },

  uploadAndBindAsset: async (nodeId, file) => {
    const isOffline = get().isOfflineMode;
    const storeInstanceId = get().instanceId;
    const resolvedInstanceId = resolveInstanceIdFromNode(nodeId) || storeInstanceId;
    const resolvedNodeKey = resolveNodeKey(nodeId);

    if (isOffline || !resolvedInstanceId) {
      // Simulate file upload locally
      const localUrl = URL.createObjectURL(file);
      get().bindAsset(nodeId, localUrl, 'uploaded');
      return;
    }

    try {
      // 1. Upload File
      const formData = new FormData();
      formData.append("file", file);

      const uploadResp = await fetch(`${BACKEND_URL}/api/v1/assets/upload`, {
        method: "POST",
        body: formData
      });

      const assetData = await uploadResp.json();

      // 2. Bind to target node key
      const bindResp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}/nodes/${resolvedNodeKey}/asset-binding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetData.asset_id,
          source_type: "uploaded"
        })
      });
      if (!bindResp.ok) {
        const errData = await bindResp.json().catch(() => ({}));
        console.error("Asset binding failed on backend:", errData.detail || bindResp.statusText);
      }

      // 3. Reload from Backend to refresh details
      const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}`);
      const details = await detailsResp.json();
      
      const mergedNodes = details.nodes.map((bNode: any) => {
        const localNode = get().nodes.find(ln => ln.id === bNode.id);
        return {
          ...bNode,
          position: localNode ? localNode.position : { x: 0, y: 0 }
        };
      });
      
      set({ nodes: mergedNodes });
      
    } catch (e) {
      console.error("Binding failed on backend, falling back to local simulation", e);
      const localUrl = URL.createObjectURL(file);
      get().bindAsset(nodeId, localUrl, 'uploaded');
    }
  },

  setProductLine: async (line) => {
    set({ productLine: line });
    const isOffline = get().isOfflineMode;
    const canvasId = get().canvasId;
    let success = false;
    if (!isOffline && canvasId) {
      try {
        const templateId = line === 'hanging' ? 'tpl_hanging' : 'tpl_desk';
        const url = `${BACKEND_URL}/api/v1/canvases/${canvasId}/instances`;
        const instanceResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: templateId,
            product_sku: line === 'hanging' ? "SKU2027-A01" : "SKU2027-B01"
          })
        });
        if (instanceResp.ok) {
          const { instance_id } = await instanceResp.json();
          set({ instanceId: instance_id, mergedVideoUrl: null });
          
          // Load details from backend
          const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${instance_id}`);
          if (detailsResp.ok) {
            const details = await detailsResp.json();
            
            // Merge positions
            const localNodes = line === 'hanging' ? initialHangingNodes : getDeskLocalNodes();
            const mergedNodes = details.nodes.map((bNode: any) => {
              const localNode = localNodes.find(ln => ln.id === bNode.id);
              return {
                ...bNode,
                position: localNode ? localNode.position : { x: 0, y: 0 }
              };
            });
            set({ nodes: mergedNodes });
            success = true;
          }
        }
      } catch (e) {
        console.error("Failed to switch product line on backend, falling back to local nodes", e);
      }
    }
    
    if (!success) {
      // Offline mode fallback
      if (line === 'hanging') {
        set({
          nodes: initialHangingNodes,
          edges: initialHangingEdges,
          mergedVideoUrl: null,
        });
      } else {
        set({
          nodes: getDeskLocalNodes(),
          edges: initialHangingEdges,
          mergedVideoUrl: null,
        });
      }
    }
    get().calculateTotalDuration();
  },

  saveTemplate: async (name) => {
    const isOffline = get().isOfflineMode;
    
    // Strip asset bindings from data on non-fixed nodes (H2 requirement)
    const cleanNodes = get().nodes.map(n => {
      if (n.data?.isFixed) return n;
      const cleanData = { ...n.data };
      delete cleanData.boundAssetUrl;
      delete cleanData.boundAssetSource;
      delete cleanData.boundAssetRoleKey;
      return {
        ...n,
        data: cleanData
      };
    });

    // Add transition_duration to edges payload (Sprint 2 rule 3 requirement)
    const cleanEdges = get().edges.map(e => ({
      ...e,
      transition_duration: 0.3
    }));

    const templateData = {
      product_id: get().productLine === 'hanging' ? 'hanging_calendar' : 'desk_calendar',
      name: name,
      nodes: cleanNodes,
      edges: cleanEdges
    };
    
    if (!isOffline) {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/v1/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData)
        });
        const data = await resp.json();
        return data.template_id;
      } catch (e) {
        console.error("Failed to save template on backend, falling back to local mock", e);
        return "tpl_custom_mock";
      }
    } else {
      console.log("Offline mode: Saved template local mock", templateData);
      return "tpl_custom_mock";
    }
  },

  loadTemplate: async (templateId) => {
    const isOffline = get().isOfflineMode;
    const canvasId = get().canvasId;
    let success = false;
    
    if (!isOffline && canvasId) {
      try {
        // Clone the custom template on backend
        const instanceResp = await fetch(`${BACKEND_URL}/api/v1/canvases/${canvasId}/instances`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: templateId,
            product_sku: get().productLine === 'hanging' ? "SKU2027-A01" : "SKU2027-B01"
          })
        });
        if (instanceResp.ok) {
          const { instance_id } = await instanceResp.json();
          set({ instanceId: instance_id, mergedVideoUrl: null });
          
          // Fetch instance details
          const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${instance_id}`);
          if (detailsResp.ok) {
            const details = await detailsResp.json();
            
            // Merge positions
            const localNodes = get().productLine === 'hanging' ? initialHangingNodes : getDeskLocalNodes();
            const mergedNodes = details.nodes.map((bNode: any) => {
              const localNode = localNodes.find(ln => ln.id === bNode.id);
              return {
                ...bNode,
                position: localNode ? localNode.position : { x: 0, y: 0 }
              };
            });
            set({ nodes: mergedNodes });
            success = true;
          }
        }
      } catch (e) {
        console.error("Failed to load template on backend, falling back to local reset", e);
      }
    }
    
    if (!success) {
      // Offline mode fallback: just reset bindings
      const localNodes = get().productLine === 'hanging' ? initialHangingNodes : getDeskLocalNodes();
      const cleanNodes = localNodes.map(node => {
        if (node.data.isFixed) return node;
        return {
          ...node,
          data: {
            ...node.data,
            boundAssetUrl: undefined,
            boundAssetSource: undefined,
            boundAssetRoleKey: undefined,
            status: 'pending' as const
          }
        };
      });
      set({ nodes: cleanNodes, mergedVideoUrl: null });
    }
    get().calculateTotalDuration();
  },

  calculateTotalDuration: () => {
    const total = get().nodes
      .filter((n) => n.data.nodeType === 'shot')
      .reduce((sum, n) => sum + (n.data.duration || 0), 0);
    set({ totalDuration: total });
  },

  triggerMockGeneration: async (nodeId) => {
    const isOffline = get().isOfflineMode;
    const storeInstanceId = get().instanceId;
    const resolvedInstanceId = resolveInstanceIdFromNode(nodeId) || storeInstanceId;
    const resolvedNodeKey = resolveNodeKey(nodeId);

    if (isOffline || !resolvedInstanceId) {
      // Offline mode: simulate generation with realistic success/failure probability
      get().updateNodeStatus(nodeId, 'generating');
      setTimeout(() => {
        const isSuccess = Math.random() > 0.15;
        get().updateNodeStatus(nodeId, isSuccess ? 'success' : 'failed');
      }, 3000);
      return;
    }

    try {
      // Backend generation flow
      const resp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}/nodes/${resolvedNodeKey}/generate`, {
        method: "POST"
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `Backend returned ${resp.status}`);
      }

      get().updateNodeStatus(nodeId, 'generating');

      // Start polling status from backend
      const interval = setInterval(async () => {
        const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}`);
        const details = await detailsResp.json();
        const targetNode = details.nodes.find((n: any) => n.id === resolvedNodeKey);

        if (targetNode && targetNode.data.status !== 'generating') {
          clearInterval(interval);
          get().updateNodeStatus(nodeId, targetNode.data.status);
        }
      }, 1000);

    } catch (e: any) {
      console.error("Generation failed:", e.message || e);
      // Set node to failed so user can see the real error and retry
      get().updateNodeStatus(nodeId, 'failed');
    }
  },

  triggerAIGenerateCandidates: async (nodeId) => {
    const isOffline = get().isOfflineMode;
    const storeInstanceId = get().instanceId;
    const resolvedInstanceId = resolveInstanceIdFromNode(nodeId) || storeInstanceId;
    const resolvedNodeKey = resolveNodeKey(nodeId);

    if (isOffline || !resolvedInstanceId) {
      get().updateNodeData(nodeId, { aiCandidateStatus: 'candidates_generating' });
      get().updateNodeStatus(nodeId, 'generating');

      setTimeout(() => {
        const candidates = [
          { id: 'c1', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80' },
          { id: 'c2', url: 'https://images.unsplash.com/photo-1512909006721-3d6018887383?w=400&q=80' },
          { id: 'c3', url: 'https://images.unsplash.com/photo-1545239351-ef35f43d514b?w=400&q=80' },
          { id: 'c4', url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80' },
        ];
        get().updateNodeData(nodeId, {
          aiCandidateStatus: 'pending_selection',
          aiCandidates: candidates,
        });
        get().updateNodeStatus(nodeId, 'pending');
      }, 2500);
      return;
    }
    
    try {
      get().updateNodeData(nodeId, { aiCandidateStatus: 'candidates_generating' });
      get().updateNodeStatus(nodeId, 'generating');
      
      const resp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}/nodes/${resolvedNodeKey}/generate-candidates`, {
        method: "POST"
      });
      const data = await resp.json();
      
      get().updateNodeData(nodeId, {
        aiCandidateStatus: 'pending_selection',
        aiCandidates: data.candidates
      });
      get().updateNodeStatus(nodeId, 'pending');
      
    } catch (e) {
      console.error(e);
      get().updateNodeData(nodeId, { aiCandidateStatus: 'not_triggered' });
      get().updateNodeStatus(nodeId, 'pending');
    }
  },

  selectAICandidate: async (nodeId, candidateId) => {
    const isOffline = get().isOfflineMode;
    const storeInstanceId = get().instanceId;
    const resolvedInstanceId = resolveInstanceIdFromNode(nodeId) || storeInstanceId;
    const resolvedNodeKey = resolveNodeKey(nodeId);

    if (isOffline || !resolvedInstanceId) {
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const candidate = node.data.aiCandidates?.find((c) => c.id === candidateId);
      if (!candidate) return;

      get().updateNodeData(nodeId, {
        aiCandidateStatus: 'locked',
        selectedCandidateId: candidateId,
      });
      get().updateNodeStatus(nodeId, 'success');
      get().bindAsset('S01_main', candidate.url, 'generated');
      return;
    }
    
    try {
      await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}/nodes/${resolvedNodeKey}/select-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId })
      });
      
      // Reload details from backend
      const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${resolvedInstanceId}`);
      const details = await detailsResp.json();
      
      const mergedNodes = details.nodes.map((bNode: any) => {
        const localNode = get().nodes.find(ln => ln.id === bNode.id);
        return {
          ...bNode,
          position: localNode ? localNode.position : { x: 0, y: 0 }
        };
      });
      
      set({ nodes: mergedNodes });
      
    } catch (e) {
      console.error(e);
    }
  },

  triggerMockMerge: async () => {
    const isOffline = get().isOfflineMode;
    const instanceId = get().instanceId;
    
    const duration = get().totalDuration;
    if (duration < 25 || duration > 30) {
      alert(`合成失败：总时长必须在 25～30 秒之间，当前为 ${duration} 秒！`);
      return;
    }

    const allSuccess = get().nodes
      .filter((n) => n.data.nodeType === 'shot')
      .every((n) => n.data.status === 'success');
      
    if (!allSuccess) {
      alert('合成失败：必须确保所有分镜节点均成功（Success）生成！');
      return;
    }

    if (isOffline || !instanceId) {
      set({ isMerging: true });
      get().updateNodeStatus('M01_merge', 'generating');

      setTimeout(() => {
        set({
          isMerging: false,
          mergedVideoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
        });
        get().updateNodeStatus('M01_merge', 'success');
      }, 4000);
      return;
    }
    
    try {
      set({ isMerging: true });
      get().updateNodeStatus('M01_merge', 'generating');
      
      await fetch(`${BACKEND_URL}/api/v1/instances/${instanceId}/merge`, {
        method: "POST"
      });
      
      // Poll merge status
      const interval = setInterval(async () => {
        const detailsResp = await fetch(`${BACKEND_URL}/api/v1/instances/${instanceId}`);
        const details = await detailsResp.json();
        
        if (details.status === 'completed') {
          clearInterval(interval);
          set({
            isMerging: false,
            mergedVideoUrl: details.merged_video_url
          });
          get().updateNodeStatus('M01_merge', 'success');
        }
      }, 1000);
      
    } catch (e) {
      console.error(e);
      set({ isMerging: false });
      get().updateNodeStatus('M01_merge', 'failed');
    }
  },

  resetAll: () => {
    const line = get().productLine;
    get().setProductLine(line);
    get().initWorkspace();
  },
}));
