import { useState, useEffect, useRef } from "react";
import { documentsApi } from "../api/index.js";
import { parserService } from "../utils/fileTypes.js";

/**
 * 文档"识别文字"预览弹窗
 * props: { doc, onClose }
 */
export default function DocPreviewModal({ doc, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [imgUrl, setImgUrl] = useState("");
  const imgRef = useRef("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    documentsApi
      .preview(doc.id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));

    // 图片类型额外拉原图缩略展示
    if (parserService.isImage(doc.filename)) {
      documentsApi
        .rawBlobUrl(doc.id)
        .then((url) => {
          if (!alive) {
            URL.revokeObjectURL(url);
            return;
          }
          imgRef.current = url;
          setImgUrl(url);
        })
        .catch(() => {});
    }

    return () => {
      alive = false;
      if (imgRef.current) URL.revokeObjectURL(imgRef.current);
    };
  }, [doc.id, doc.filename]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e8edea]">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">
              {parserService.fileIcon(doc.filename).emoji} {doc.filename}
            </div>
            <div className="text-[11px] text-[#68736d] mt-0.5">
              {data
                ? `识别出 ${data.total_chars} 个字符${
                    data.source === "indexed" ? " · 已切分入库，可直接检索" : ""
                  }`
                : "正在读取识别内容..."}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#68736d] hover:bg-[#f5f7f3] rounded-lg text-lg shrink-0"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-sm text-[#68736d] py-10 text-center">识别内容加载中...</div>}
          {!loading && error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <>
              {imgUrl && (
                <img
                  src={imgUrl}
                  alt={doc.filename}
                  className="max-h-64 rounded-lg border border-[#e8edea] mb-4 mx-auto"
                />
              )}
              {data.text ? (
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 font-sans">
                  {data.text}
                </pre>
              ) : (
                <div className="text-sm text-[#68736d] py-8 text-center">
                  {doc.status === "failed"
                    ? `文档处理失败：${doc.error_message || "未知原因"}`
                    : "暂未识别到文字（文档可能还在处理中，或内容为空）"}
                </div>
              )}
              {data.total_chars > data.text.length && (
                <div className="text-[11px] text-[#68736d] mt-3 text-center">
                  内容较长，仅预览前 5 万字符
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
