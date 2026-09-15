import { Link, useParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { spacesApi, documentsApi } from "../api/index.js";
import { chatApi } from "../api/chat.js";
import ChatPanel from "./ChatPanel.jsx";
import ConversationList from "../components/ConversationList.jsx";
import DocPreviewModal from "../components/DocPreviewModal.jsx";
import { ACCEPT_ATTR, fileIcon } from "../utils/fileTypes.js";

const STATUS_CONFIG = {
  pending: { label: "等待中", dot: "bg-gray-400" },
  parsing: { label: "解析中", dot: "bg-blue-500 animate-pulse" },
  chunking: { label: "切分中", dot: "bg-yellow-500 animate-pulse" },
  embedding: { label: "生成向量中", dot: "bg-yellow-500 animate-pulse" },
  ready: { label: "已就绪", dot: "bg-green-500" },
  failed: { label: "失败", dot: "bg-red-500" },
};

export default function SpaceDetail() {
  const { id } = useParams();
  const [space, setSpace] = useState(null);
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // === 对话历史 ===
  const [conversations, setConversations] = useState([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [activeConvId, setActiveConvId] = useState(null);

  // 文档识别文字预览弹窗
  const [previewDoc, setPreviewDoc] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        spacesApi.get(id),
        documentsApi.list(id),
      ]);
      setSpace(s);
      setDocs(d);
    } catch {
      setSpace(null);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 切换空间时先清空，避免短暂显示上一个空间的对话
  useEffect(() => {
    setConversations([]);
    setActiveConvId(null);
  }, [id]);

  // 加载对话列表，默认选中最近一条
  const loadConversations = useCallback(async (selectLatest = false) => {
    setConvsLoading(true);
    try {
      const list = await chatApi.listConversations(id);
      setConversations(list);
      if (selectLatest) {
        setActiveConvId(list.length > 0 ? list[0].id : null);
      }
    } catch {
      setConversations([]);
    } finally {
      setConvsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadConversations(true);
  }, [loadConversations]);

  // ChatPanel 发出第一条消息后会拿到新建对话的 id
  const handleConvCreated = useCallback((convId) => {
    setActiveConvId(convId);
    loadConversations(false);
  }, [loadConversations]);

  const handleSelectConv = (convId) => {
    setActiveConvId(convId);
  };

  const handleNewConv = () => {
    setActiveConvId(null);
  };

  const handleDeleteConv = async (convId) => {
    try {
      await chatApi.deleteConversation(convId);
      if (activeConvId === convId) setActiveConvId(null);
      await loadConversations(false);
    } catch (e) {
      alert(e.message);
    }
  };

  // 处理轮询：有文档在处理中就每 2s 刷新
  useEffect(() => {
    const hasProcessing = docs.some((d) =>
      ["pending", "parsing", "chunking", "embedding"].includes(d.status)
    );
    if (!hasProcessing) return;
    const timer = setInterval(loadAll, 2000);
    return () => clearInterval(timer);
  }, [docs, loadAll]);

  if (!space) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="text-center text-[#68736d] mt-20">加载中或空间不存在...</div>
      </div>
    );
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        await documentsApi.upload(id, f);
      }
      await loadAll();
    } catch (err) {
      alert("上传失败: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm("确认删除？")) return;
    try {
      await documentsApi.delete(docId);
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRetry = async (docId) => {
    try {
      await documentsApi.retry(docId);
      loadAll();
    } catch (e) {
      alert(e.message);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getDocIcon = (filename) => fileIcon(filename);

  return (
    <div className="flex h-screen">
      {/* 左侧：对话历史 + 文档列表 */}
      <div className="w-[300px] shrink-0 border-r border-[#e8edea] flex flex-col bg-white">
        {/* 顶部标题 + 返回 */}
        <div className="p-4 border-b border-[#e8edea]">
          <Link to="/app" className="text-[#68736d] text-xs hover:text-[#16745b] inline-block mb-2">
            ← 所有空间
          </Link>
          <h2 className="font-bold text-base truncate">{space.name}</h2>
          <p className="text-[11px] text-[#68736d] mt-0.5">{docs.length} 个文件</p>
        </div>

        {/* 对话历史 */}
        <ConversationList
          conversations={conversations}
          activeId={activeConvId}
          loading={convsLoading}
          onSelect={handleSelectConv}
          onNew={handleNewConv}
          onDelete={handleDeleteConv}
        />

        {/* 资料区 */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* 上传按钮 */}
          <div className="p-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2 bg-[#16745b] text-white text-sm font-semibold rounded-lg hover:bg-[#125f4a] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span>+</span> {uploading ? "上传中..." : "导入资料"}
            </button>
          </div>

          {/* 空状态引导 */}
          {docs.length === 0 ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="bg-[#f5f7f3] border border-dashed border-[#dfe6e0] rounded-lg p-5 text-center">
                <div className="text-3xl mb-3">📄</div>
                <p className="text-sm text-[#59665e] font-semibold mb-1">还没有资料</p>
                <p className="text-xs text-[#68736d] leading-relaxed">
                  导入 PDF、Word 或文本文件，<br />
                  AI 就能基于它们回答你的问题
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-4 px-4 py-1.5 text-xs bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] disabled:opacity-50"
                >
                  选择文件
                </button>
              </div>
              <div className="mt-4 text-[11px] text-[#68736d] px-1 leading-relaxed">
                <p className="font-semibold mb-1">支持格式</p>
                <p>PDF · Word · 文本 · Markdown · 图片(PNG/JPG，自动 OCR 识别文字)</p>
              </div>
            </div>
          ) : (
            /* 文档列表 */
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
              {docs.map((d) => {
                const si = STATUS_CONFIG[d.status] || { label: d.status, dot: "bg-gray-400" };
                const icon = getDocIcon(d.filename);
                return (
                  <div
                    key={d.id}
                    onClick={() => setPreviewDoc(d)}
                    title="点击查看识别出的文字"
                    className="group px-3 py-2.5 rounded-lg hover:bg-[#f5f7f3] cursor-pointer transition"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${icon.bg}`}>
                        <span className={icon.color + " text-sm"}>{icon.emoji}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{d.filename}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${si.dot}`} />
                          <span className="text-[11px] text-[#68736d] truncate">
                            {si.label}
                            {d.chunk_count > 0 && ` · ${d.chunk_count}片段`}
                          </span>
                        </div>
                        {d.error_message && (
                          <div className="text-[11px] text-red-600 truncate mt-0.5" title={d.error_message}>
                            {d.error_message}
                          </div>
                        )}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
                        {d.status === "failed" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetry(d.id); }}
                            className="w-6 h-6 flex items-center justify-center text-[11px] text-[#16745b] hover:bg-[#edf3ee] rounded"
                            title="重试"
                          >
                            ↻
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                          className="w-6 h-6 flex items-center justify-center text-[11px] text-red-500 hover:bg-red-50 rounded"
                          title="删除"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：问答面板 */}
      <div className="flex-1 overflow-y-auto bg-[#f5f7f3] p-6">
        <ChatPanel
          spaceId={id}
          activeConvId={activeConvId}
          onConvCreated={handleConvCreated}
          onDocsChanged={loadAll}
          docCount={docs.length}
        />
      </div>

      {/* 识别文字预览 */}
      {previewDoc && (
        <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
