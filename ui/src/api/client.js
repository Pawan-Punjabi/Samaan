const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return data;
}

export function checkHealth() {
  return request('/health');
}

export function uploadCsv(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/flow/upload', { method: 'POST', body: form });
}

export function loadSampleFlow(template = 'reorder_po') {
  return request(`/flow/sample?template=${encodeURIComponent(template)}`);
}

export function runFlow(graph) {
  return request('/flow/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(graph),
  });
}

export async function exportFlowCsv(graph, exportType, filename, nodeId = null) {
  const res = await fetch(`${API_BASE}/flow/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph, export_type: exportType, node_id: nodeId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
