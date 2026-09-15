const API_BASE = "";

function authHeaders() {
  const token = localStorage.getItem("rag_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败: ${res.status}`);
  }
  return res.json();
}

async function requestRaw(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `请求失败: ${res.status}`);
  }
  return res;
}

export const spacesApi = {
  list: () => request("/api/spaces"),
  create: (data) => request("/api/spaces", { method: "POST", body: JSON.stringify(data) }),
  get: (id) => request(`/api/spaces/${id}`),
  update: (id, data) => request(`/api/spaces/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id) => request(`/api/spaces/${id}`, { method: "DELETE" }),
};

export const documentsApi = {
  list: (spaceId) => request(`/api/spaces/${spaceId}/documents`),
  get: (docId) => request(`/api/documents/${docId}`),
  delete: (docId) => request(`/api/documents/${docId}`, { method: "DELETE" }),
  retry: (docId) => request(`/api/documents/${docId}/retry`, { method: "POST" }),
  preview: (docId) => request(`/api/documents/${docId}/preview`),
  // 读取原始文件（图片预览），返回 blob URL，组件卸载时需 URL.revokeObjectURL
  rawBlobUrl: async (docId) => {
    const res = await requestRaw(`/api/documents/${docId}/raw`);
    return URL.createObjectURL(await res.blob());
  },
  upload: (spaceId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return requestRaw(`/api/spaces/${spaceId}/documents`, {
      method: "POST",
      body: fd,
      // 不要手动设 Content-Type，让浏览器自动加 boundary
      headers: {},
    }).then(r => r.json());
  },
};

export const searchApi = {
  test: (spaceId, q, topK = 5) =>
    request(`/api/search?space_id=${spaceId}&q=${encodeURIComponent(q)}&top_k=${topK}`),
};
