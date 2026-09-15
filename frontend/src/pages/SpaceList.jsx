import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { spacesApi } from "../api/index.js";

export default function SpaceList() {
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }

  const load = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await spacesApi.list();
      setSpaces(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await spacesApi.create({ name: newName.trim(), description: newDesc.trim() });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (e, id, name) => {
    e.stopPropagation();
    setConfirmDelete({ id, name });
  };

  const confirmDeleteSpace = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    try {
      await spacesApi.delete(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
    return d.toLocaleDateString();
  };

  // 空状态
  if (!loading && spaces.length === 0 && !error) {
    return (
      <div className="max-w-4xl mx-auto p-12">
        <h1 className="text-3xl font-bold mb-2">知识空间</h1>
        <p className="text-[#68736d] mb-8">
          创建第一个知识空间，把你的资料放进去开始问答
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="px-6 py-3 bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] transition"
        >
          + 创建第一个知识空间
        </button>

        {showCreate && (
          <CreateDialog
            onClose={() => setShowCreate(false)}
            newName={newName}
            setNewName={setNewName}
            newDesc={newDesc}
            setNewDesc={setNewDesc}
            onCreate={handleCreate}
            creating={creating}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">知识空间</h1>
          <p className="text-[#68736d] text-sm mt-1">
            {spaces.length} 个空间
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={creating}
          className="px-4 py-2 bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] transition text-sm disabled:opacity-50"
        >
          + 新建
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-[#68736d] py-12">加载中...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {spaces.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/app/spaces/${s.id}`)}
              className="bg-white border border-[#dfe6e0] rounded-xl p-5 cursor-pointer hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">📚</span>
                <button
                  onClick={(e) => handleDeleteClick(e, s.id, s.name)}
                  disabled={creating}
                  className="opacity-0 group-hover:opacity-100 text-[#68736d] hover:text-red-600 text-xs disabled:opacity-30"
                  title="删除"
                >
                  ✕
                </button>
              </div>
              <div className="font-bold mt-3 text-lg">{s.name}</div>
              <div className="text-[#68736d] text-sm mt-1">
                {s.doc_count} 文档
              </div>
              <div className="text-[11px] text-[#68736d] mt-3">
                上次使用：{formatTime(s.updated_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          newName={newName}
          setNewName={setNewName}
          newDesc={newDesc}
          setNewDesc={setNewDesc}
          onCreate={handleCreate}
          creating={creating}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-2">确认删除？</h3>
            <p className="text-[#68736d] text-sm mb-1">
              确定要删除知识空间「{confirmDelete.name}」吗？
            </p>
            <p className="text-[#68736d] text-xs mb-5">
              其中所有文档、向量数据和对话历史都会被清除，无法恢复。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-[#68736d] hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteSpace}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDialog({ onClose, newName, setNewName, newDesc, setNewDesc, onCreate, creating }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-6 w-[420px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">新建知识空间</h2>
        <label className="block text-sm font-semibold mb-1">名称 *</label>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          placeholder="例如：面试资料"
          className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-[#16745b]"
        />
        <label className="block text-sm font-semibold mb-1">描述（可选）</label>
        <textarea
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="这个空间用来做什么？"
          rows={3}
          className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-[#16745b] resize-none"
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#68736d] hover:bg-[#edf3ee] rounded-lg"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={!newName.trim() || creating}
            className="px-4 py-2 text-sm bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] disabled:opacity-50"
          >
            {creating ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
