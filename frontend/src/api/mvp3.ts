/**
 * MVP-3 API wrappers for the production workbench.
 */
async function request<T = any>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.detail || (typeof data === 'string' ? data : resp.statusText);
    throw new Error(msg);
  }
  return data;
}

// Products
export const createProduct = (body: { product_type: string; sku: string; title: string }) =>
  request('/api/v1/products', { method: 'POST', body: JSON.stringify(body) });

export const listProducts = (params?: string) =>
  request(`/api/v1/products${params ? '?' + params : ''}`);

export const getProduct = (id: string) => request(`/api/v1/products/${id}`);

export const registerAsset = (productId: string, body: { original_filename: string; file_url: string }) =>
  request(`/api/v1/products/${productId}/assets`, { method: 'POST', body: JSON.stringify(body) });

export const updateAssetRole = (productId: string, assetId: string, roleKey: string) =>
  request(`/api/v1/products/${productId}/assets/${assetId}/role`, { method: 'PUT', body: JSON.stringify({ role_key: roleKey }) });

export const getChecklist = (productId: string) =>
  request(`/api/v1/products/${productId}/checklist`);

// Video Templates
export const listVideoTemplates = (productType?: string) =>
  request(`/api/v1/video-templates${productType ? '?product_type=' + productType : ''}`);

export const getVideoTemplate = (id: string) =>
  request(`/api/v1/video-templates/${id}`);

// Video Batches
export const createVideoBatch = (templateId: string, productIds: string[]) =>
  request('/api/v1/video-batches', { method: 'POST', body: JSON.stringify({ template_id: templateId, product_ids: productIds }) });

export const getVideoBatch = (id: string) =>
  request(`/api/v1/video-batches/${id}`);

export const generateVideoBatch = (id: string) =>
  request(`/api/v1/video-batches/${id}/generate`, { method: 'POST', body: JSON.stringify({}) });

// Asset file upload (multipart)
export const uploadAssetFile = async (file: File): Promise<{ asset_id: string; filename: string; url: string; role_key: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const resp = await fetch('/api/v1/assets/upload', { method: 'POST', body: formData });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const msg = data.detail || resp.statusText; throw new Error(msg); }
  return data;
};

// Video instance node asset binding
export const bindAssetToVideoNode = (instanceId: string, shotKey: string, body: { asset_id: string; source_type: string; asset_role?: string }) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bind`, { method: 'PUT', body: JSON.stringify(body) });

// Multi-asset binding CRUD (9B-3C)
export const getNodeBindings = (instanceId: string, shotKey: string) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bindings`);

export const upsertStartFrameBinding = (instanceId: string, shotKey: string, body: { asset_id: string; source?: string }) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bindings/start_frame`, { method: 'PUT', body: JSON.stringify(body) });

export const upsertEndFrameBinding = (instanceId: string, shotKey: string, body: { asset_id: string; source?: string }) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bindings/end_frame`, { method: 'PUT', body: JSON.stringify(body) });

export const addReferenceImageBinding = (instanceId: string, shotKey: string, body: { asset_id: string; source?: string; sort_order?: number }) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bindings/reference_images`, { method: 'POST', body: JSON.stringify(body) });

export const deleteNodeBinding = (instanceId: string, shotKey: string, bindingId: string) =>
  request(`/api/v1/video-instances/${instanceId}/nodes/${shotKey}/bindings/${bindingId}`, { method: 'DELETE' });

// Video Instances
export const getVideoInstance = (id: string) =>
  request(`/api/v1/video-instances/${id}`);

export const mergePreview = (instanceId: string) =>
  request(`/api/v1/video-instances/${instanceId}/merge-preview`, { method: 'POST', body: JSON.stringify({}) });

export const reviewInstance = (instanceId: string, action: string) =>
  request(`/api/v1/video-instances/${instanceId}/review`, { method: 'POST', body: JSON.stringify({ action }) });

export const exportInstance = (instanceId: string) =>
  request(`/api/v1/video-instances/${instanceId}/export`, { method: 'POST', body: JSON.stringify({}) });

export const getInstanceReviews = (instanceId: string) =>
  request(`/api/v1/video-instances/${instanceId}/reviews`);

// Video Nodes
export const getVideoNode = (nodeId: string) =>
  request(`/api/v1/video-nodes/${nodeId}`);

export const generateVideoNode = (nodeId: string, body?: { prompt?: string }) =>
  request(`/api/v1/video-nodes/${nodeId}/generate`, { method: 'POST', body: JSON.stringify(body || {}) });

export const retryVideoNode = (nodeId: string) =>
  request(`/api/v1/video-nodes/${nodeId}/retry`, { method: 'POST', body: JSON.stringify({}) });

export const reviewVideoNode = (nodeId: string, action: string, reason?: string) =>
  request(`/api/v1/video-nodes/${nodeId}/review`, { method: 'POST', body: JSON.stringify({ action, reason: reason || '' }) });

export const getNodeJobs = (nodeId: string) =>
  request(`/api/v1/video-nodes/${nodeId}/jobs`);

export const listModelAdapters = () =>
  request('/api/v1/model-gateway/adapters');

export const getModelSettings = () =>
  request('/api/v1/model-settings');
