import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatApi } from "../api/chat.js";
import { documentsApi } from "../api/index.js";
import { ACCEPT_ATTR, fileIcon } from "../utils/fileTypes.js";

// 附件识别状态轮询间隔/上限（首次 OCR 需加载模型，最多等约 2 分钟）
const POLL_INTERVAL = 1500;
const POLL_MAX = 80;
const PROCESSING_STATUSES = ["pending", "parsing", "chunking", "embedding"];

export default function ChatPanel({ spaceId, activeConvId, onConvCreated, onDocsChanged, docCount }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  // 输入框附件：[{id, filename, status: 'processing'|'ready'|'failed'}]
  const [attachments, setAttachments] = useState([]);
  const endRef = useRef(null);
  // 正在流式生成的对话 id（父组件回写同 id 时不要从 DB 重载，覆盖掉流式内容）
  const streamConvRef = useRef(null);
  // 历史请求序号，只采纳最后一次（竞态保护 + 兼容 StrictMode 双调用）
  const reqSeqRef = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 切换对话：加载历史消息；null = 新对话（空白）
  useEffect(() => {
    // 这条对话正在当前面板流式生成（新建对话的回写），内容即最新，无需重载
    if (activeConvId != null && streamConvRef.current === activeConvId) return;

    if (activeConvId == null) {
      setMessages([]);
      setHistoryLoading(false);
      return;
    }

    const seq = ++reqSeqRef.current;
    setHistoryLoading(true);
    chatApi
      .getConversation(activeConvId)
      .then((data) => {
        if (seq !== reqSeqRef.current) return;
        setMessages(
          (data.messages || []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: m.attachments || [],
            // 后端保存的失败回答带 [错误： 前缀，渲染成错误样式
            status:
              m.role === "assistant" && m.content.includes("[错误：")
                ? "error"
                : "done",
            // 统一成流式 contexts 的字段结构，供来源卡片渲染
            contexts: (m.references || []).map((r, i) => ({
              id: `${r.document_id}-${r.chunk_index}-${i}`,
              filename: r.filename,
              content: r.snippet,
              rrf_score: r.score,
            })),
          }))
        );
      })
      .catch(() => {
        if (seq === reqSeqRef.current) setMessages([]);
      })
      .finally(() => {
        if (seq === reqSeqRef.current) setHistoryLoading(false);
      });
  }, [activeConvId]);

  // 聊天框直接上传附件：先入库（进空间资料），再轮询识别状态
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      let doc;
      try {
        doc = await documentsApi.upload(spaceId, file);
      } catch (e) {
        alert(`上传失败（${file.name}）: ${e.message}`);
        continue;
      }
      const chip = { id: doc.id, filename: doc.filename, status: "processing" };
      setAttachments((a) => [...a, chip]);
      // 轮询直到 ready/failed
      let tries = 0;
      const timer = setInterval(async () => {
        tries += 1;
        try {
          const latest = await documentsApi.get(doc.id);
          if (!PROCESSING_STATUSES.includes(latest.status)) {
            clearInterval(timer);
            setAttachments((a) =>
              a.map((x) =>
                x.id === doc.id
                  ? { ...x, status: latest.status === "ready" ? "ready" : "failed" }
                  : x
              )
            );
            onDocsChanged?.();
          }
        } catch {
          clearInterval(timer);
          setAttachments((a) => a.map((x) => (x.id === doc.id ? { ...x, status: "failed" } : x)));
        }
        if (tries >= POLL_MAX) {
          clearInterval(timer);
          setAttachments((a) => a.map((x) => (x.id === doc.id ? { ...x, status: "failed" } : x)));
        }
      }, POLL_INTERVAL);
    }
    onDocsChanged?.();
  };

  const removeAttachment = (docId) => {
    // 仅取消本条消息的附带范围，不删除空间里已上传的资料
    setAttachments((a) => a.filter((x) => x.id !== docId));
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const processing = attachments.some((a) => a.status === "processing");
    if (processing) return;

    // 本条消息携带的附件（仅就绪的）；为空时后端在整个空间范围检索
    const readyAttachs = attachments
      .filter((a) => a.status === "ready")
      .map((a) => ({ id: a.id, filename: a.filename }));
    const docIds = readyAttachs.map((a) => a.id);

    // 先插入 user 消息
    const userMsg = {
      id: `tmp-u-${Date.now()}`,
      role: "user",
      content: query,
      attachments: readyAttachs,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);

    // 占位 assistant 消息
    const assistantId = `tmp-a-${Date.now()}`;
    const assistantMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      contexts: [],
      status: "loading", // loading | streaming | done | error | no_context
    };
    setMessages((m) => [...m, assistantMsg]);

    try {
      const resp = await chatApi.stream(spaceId, query, activeConvId, docIds);
      if (!resp.ok || !resp.body) {
        throw new Error(`请求失败: ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 按 \n\n 切分 SSE 事件；保留最后一段（可能是未接收完整的事件）
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const raw = dataLine.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue;
          }

          const { type, data } = parsed;

          if (type === "conversation") {
            // 后端确认了对话 id（首次提问时新建）
            streamConvRef.current = data.id;
            onConvCreated?.(data.id);
          } else if (type === "contexts") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, contexts: data, status: "streaming" } : msg
              )
            );
          } else if (type === "token") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + data }
                  : msg
              )
            );
          } else if (type === "no_context") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: msg.content || "我在资料中没有找到与这个问题相关的内容。换个方式问一下试试？",
                      status: "no_context",
                    }
                  : msg
              )
            );
          } else if (type === "error") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      content: msg.content || `出错了：${data}`,
                      status: "error",
                    }
                  : msg
              )
            );
          } else if (type === "done") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, status: "done" } : msg
              )
            );
          }
        }
      }
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `网络错误: ${e.message}`, status: "error" }
            : msg
        )
      );
    } finally {
      // 流式结束后解除保护，之后再切回本对话会从 DB 加载完整历史
      streamConvRef.current = null;
      setLoading(false);
    }
  };

  // 空状态
  if (messages.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-[#dfe6e0] rounded-xl p-8 mb-4">
          <div className="text-center py-6">
            {historyLoading ? (
              <>
                <div className="text-4xl mb-4 animate-pulse">💬</div>
                <p className="text-[#68736d] text-sm">正在加载对话历史...</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-4">💬</div>
                <h3 className="font-bold mb-2">
                  {activeConvId == null ? "开始一个新对话" : "这条对话还没有消息"}
                </h3>
                {docCount === 0 ? (
                  <p className="text-[#68736d] text-sm">
                    点输入框左侧 📎 直接上传文件/图片，或从左侧「导入资料」
                  </p>
                ) : (
                  <p className="text-[#68736d] text-sm">
                    已加载 {docCount} 份资料，可以开始提问了（也可以点 📎 临时附带文件）
                  </p>
                )}
              </>
            )}
          </div>
          {/* 建议问题 */}
          {!historyLoading && docCount > 0 && (
            <div className="mt-6 pt-6 border-t border-[#e8edea]">
              <p className="text-xs text-[#68736d] text-center mb-3">试试这些问题：</p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  "这份资料讲了什么？",
                  "帮我总结主要内容",
                  "这份资料的核心观点是什么？",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="text-left text-sm px-4 py-2.5 border border-[#dfe6e0] rounded-lg hover:border-[#16745b] hover:bg-[#f0f6f3] transition text-[#59665e]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <InputBar
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onFiles={handleFiles}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          loading={loading}
          docCount={docCount}
          spaceId={spaceId}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* 历史消息 */}
      <div className="space-y-4 mb-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={endRef} />
      </div>

      <InputBar
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onFiles={handleFiles}
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
        loading={loading}
        docCount={docCount}
        spaceId={spaceId}
      />
    </div>
  );
}

function AttachmentChips({ attachments, onRemove, size = "normal" }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map((a) => {
        const icon = fileIcon(a.filename);
        const failed = a.status === "failed";
        return (
          <div
            key={a.id}
            title={failed ? "识别失败，可在左侧资料列表重试" : "仅本条消息附带，检索范围限定在该文件"}
            className={`flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg border text-xs ${
              failed
                ? "bg-red-50 border-red-200 text-red-600"
                : a.status === "processing"
                ? "bg-[#f5f7f3] border-[#dfe6e0] text-[#59665e]"
                : "bg-[#edf3ee] border-[#cfe0d7] text-[#16745b]"
            }`}
          >
            <span>{icon.emoji}</span>
            <span className={size === "bubble" ? "max-w-[160px]" : "max-w-[200px]"}>
              <span className="truncate inline-block align-bottom max-w-full">{a.filename}</span>
            </span>
            {a.status === "processing" && (
              <span className="text-[10px] text-[#68736d]">识别中…</span>
            )}
            {failed && <span className="text-[10px]">失败</span>}
            {onRemove && a.status !== "processing" && (
              <button
                onClick={() => onRemove(a.id)}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-black/5"
                title="移除附件（不会删除空间中的资料）"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          {msg.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1 justify-end">
              {msg.attachments.map((a) => {
                const icon = fileIcon(a.filename);
                return (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 bg-white/15 rounded-lg px-2 py-1 text-[11px]"
                    title="本条消息附带的文件"
                  >
                    {icon.emoji} {a.filename}
                  </span>
                );
              })}
            </div>
          )}
          <div className="bg-[#16745b] text-white rounded-2xl rounded-br-sm px-4 py-2 whitespace-pre-wrap text-sm">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  // assistant
  const contexts = msg.contexts || [];
  const isError = msg.status === "error";
  // 历史中保存的失败回答："正文...[错误：原因]" → 友好展示
  const displayContent = isError && msg.content.includes("[错误：")
    ? "回答生成失败：" + msg.content.split("[错误：")[1].replace(/\]$/, "")
    : msg.content;
  // 等 AI 内容生成完成后才显示依据来源（先看回答，再看依据）；失败回答不展示来源
  const showRefs =
    !isError &&
    contexts.length > 0 &&
    (msg.status === "done" || msg.status === "no_context");

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%]">
        <div className={`border rounded-2xl rounded-bl-sm px-4 py-3 ${
          isError ? "bg-red-50 border-red-200" : "bg-white border-[#dfe6e0]"
        }`}>
          {displayContent ? (
            <div className={`text-sm leading-relaxed ${isError ? "text-red-600" : "text-gray-800"}`}>
              {isError ? (
                displayContent
              ) : (
                <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ inline, children }) => inline
                    ? <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{children}</code>
                    : <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">{children}</code>,
                  pre: ({ children }) => <pre className="mb-2">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-[#16745b] pl-3 text-[#59665e] italic mb-2">{children}</blockquote>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#16745b] hover:underline">{children}</a>,
                }}
              >
                {msg.content}
              </ReactMarkdown>
              )}
              {msg.status === "streaming" && <span className="animate-pulse text-[#16745b]">▌</span>}
            </div>
          ) : msg.status === "loading" ? (
            <div className="text-sm text-[#68736d] italic">
              <span className="inline-block animate-pulse">思考中...</span>
            </div>
          ) : msg.status === "streaming" ? (
            <div className="text-sm text-[#68736d] italic">
              <span className="inline-block animate-pulse">生成中...</span>
            </div>
          ) : msg.status === "error" ? (
            <div className="text-sm text-red-600">
              出错了，请在设置页检查大模型配置
            </div>
          ) : null}
        </div>

        {/* 引用来源卡片 */}
        {showRefs && (
          <div className="mt-2 space-y-1.5">
            <div className="text-[11px] text-[#68736d] font-semibold px-1">
              依据来源（{contexts.length}）
            </div>
            {contexts.map((c, i) => (
              <div
                key={c.id || i}
                className="bg-white border border-[#e8edea] rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-[#edf3ee] text-[#16745b] px-1.5 py-0.5 rounded text-[10px] font-semibold">
                    [{i + 1}]
                  </span>
                  <span className="font-semibold text-[#17211d]">{c.filename || `来源${i + 1}`}</span>
                  {c.rrf_score != null && (
                    <span className="text-[#68736d] text-[10px]">
                      相关度 {(c.rrf_score * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-[#59665e] leading-relaxed line-clamp-3">
                  {c.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InputBar({ input, setInput, onSend, onFiles, attachments, onRemoveAttachment, loading, docCount }) {
  const fileInputRef = useRef(null);
  const hasProcessing = attachments.some((a) => a.status === "processing");
  const hasReady = attachments.some((a) => a.status === "ready");
  const hasFailed = attachments.some((a) => a.status === "failed");
  // 空间里没有任何资料时，只要本框上传了就绪附件也能提问
  const canSend =
    !!input.trim() && !loading && !hasProcessing && !hasFailed && (docCount > 0 || hasReady);

  return (
    <div className="sticky bottom-0 pt-4 bg-[#f5f7f3]">
      {docCount === 0 && !hasReady && !hasProcessing && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg mb-2 py-1.5 px-3 text-center">
          点左侧 📎 上传文件或图片（自动识别文字），识别完成即可提问
        </div>
      )}
      {hasProcessing && (
        <div className="text-xs text-[#68736d] mb-2 text-center">
          文件识别中，完成后自动可发送…
        </div>
      )}
      {hasFailed && (
        <div className="text-xs text-red-600 mb-2 text-center">
          有附件识别失败，请移除后重试（或在左侧资料列表点 ↻ 重试）
        </div>
      )}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-3 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <AttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
          rows={2}
          className="w-full resize-none focus:outline-none text-sm"
          disabled={loading}
        />
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="上传文件或图片（图片自动 OCR 识别文字）"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#59665e] hover:bg-[#f0f6f3] text-base disabled:opacity-50"
          >
            📎
          </button>
          <button
            onClick={onSend}
            disabled={!canSend}
            className="px-5 py-2 bg-[#16745b] text-white rounded-lg text-sm font-semibold hover:bg-[#125f4a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "生成中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
