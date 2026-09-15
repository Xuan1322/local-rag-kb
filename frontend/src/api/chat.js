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

export const chatApi = {
  stream: (spaceId, query, conversationId, documentIds = null) => {
    const payload = { space_id: spaceId, query, conversation_id: conversationId };
    if (documentIds && documentIds.length > 0) {
      payload.document_ids = documentIds;
    }
    return fetch(`${API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
  },
  listConversations: (spaceId) => request(`/api/spaces/${spaceId}/conversations`),
  getConversation: (convId) => request(`/api/conversations/${convId}`),
  deleteConversation: (convId) => request(`/api/conversations/${convId}`, { method: "DELETE" }),
  testLLM: (data) =>
    request("/api/settings/test-llm", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSettings: (data) =>
    request("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export const settingsApi = {
  get: () => request("/api/settings"),
  update: (data) =>
    request("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
