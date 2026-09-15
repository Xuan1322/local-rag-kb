import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { spacesApi, searchApi } from "../api/index.js";

export default function SearchTest() {
  const [spaces, setSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    spacesApi.list().then(setSpaces).catch(() => setSpaces([]));
  }, []);

  const handleSearch = async () => {
    if (!selectedSpace || !query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await searchApi.test(selectedSpace, query.trim(), topK));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">搜索测试</h1>
      <p className="text-[#68736d] mb-6">
        先检索，后生成 — 独立验证检索质量。对比向量 / 关键词 / 混合 RRF 三种方式的结果。
      </p>

      {spaces.length === 0 ? (
        <div className="bg-white border border-[#dfe6e0] rounded-xl p-10 text-center">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-[#59665e] text-sm mb-4">还没有知识空间，先创建一个并上传资料后再来测试检索效果</p>
          <Link
            to="/app"
            className="inline-block px-5 py-2 bg-[#16745b] text-white rounded-lg text-sm font-semibold hover:bg-[#125f4a]"
          >
            去创建空间
          </Link>
        </div>
      ) : (
      <>
      {/* 查询条件 */}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-5 mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-1">知识空间</label>
            <select
              value={selectedSpace || ""}
              onChange={(e) => setSelectedSpace(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            >
              <option value="">选择空间</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.doc_count} 文档)
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-sm font-semibold mb-1">Top K</label>
            <input
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-sm font-semibold mb-1">查询</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="输入你的问题..."
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!selectedSpace || !query.trim() || loading}
            className="px-6 py-2 bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] disabled:opacity-50 text-sm"
          >
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>
        {error && <div className="text-red-600 text-sm mt-3">{error}</div>}
      </div>

      {/* 结果 */}
      {result && <ResultView result={result} />}
      </>
      )}
    </div>
  );
}

function ResultView({ result }) {
  const { hybrid, vector_raw, keyword_raw, threshold_passed, query, top_k } = result;

  return (
    <div className="space-y-6">
      {/* 顶部概览 */}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-[#68736d]">
            查询：<span className="font-semibold text-[#17211d]">{query}</span> · Top K={top_k}
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
            threshold_passed
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }`}>
            {threshold_passed ? "✓ 有检索结果（AI 会回答）" : "⚠ 无检索结果（会说没找到）"}
          </div>
        </div>
      </div>

      {/* 混合检索结果 */}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-5">
        <h2 className="font-bold mb-4 text-sm">🔗 混合 RRF 融合结果（最终用于问答）</h2>
        {hybrid.length === 0 ? (
          <div className="text-[#68736d] text-sm">没有检索到任何片段</div>
        ) : (
          <div className="space-y-3">
            {hybrid.map((c, i) => (
              <div key={c.id} className="border border-[#e8edea] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="bg-[#edf3ee] text-[#16745b] px-2 py-0.5 rounded text-xs font-semibold">
                    #{i + 1}
                  </span>
                  <span className="text-xs font-semibold">{c.filename || "?"}</span>
                  <span className="text-xs text-[#68736d]">
                    RRF={(c.rrf_score ?? 0).toFixed(4)}
                  </span>
                  <span className="text-xs text-[#68736d]">
                    vec={(c.vector_score ?? 0).toFixed(3)}
                  </span>
                  <span className="text-xs text-[#68736d]">
                    kw={(c.keyword_score ?? 0).toFixed(3)}
                  </span>
                  <span className="text-xs text-[#68736d]">
                    来源: {(c.sources || []).join("+") || "-"}
                  </span>
                </div>
                <div className="text-sm text-gray-700 leading-relaxed">{c.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 左右对比：向量 vs 关键词 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 纯向量 */}
        <div className="bg-white border border-[#dfe6e0] rounded-xl p-5">
          <h2 className="font-bold mb-3 text-sm">📐 纯向量检索（Chroma cosine）</h2>
          {vector_raw.length === 0 ? (
            <div className="text-[#68736d] text-sm">无结果</div>
          ) : (
            <div className="space-y-2">
              {vector_raw.map((v, i) => (
                <div key={v.id} className="text-xs border-b border-[#e8edea] pb-2 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#16745b] font-semibold">#{i + 1}</span>
                    <span className="text-[#68736d]">score={(v.score ?? 0).toFixed(3)}</span>
                    <span className="text-[#68736d] text-[10px]">id={v.id}</span>
                  </div>
                  <div className="text-gray-600 line-clamp-2">{v.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 纯关键词 */}
        <div className="bg-white border border-[#dfe6e0] rounded-xl p-5">
          <h2 className="font-bold mb-3 text-sm">🔤 纯关键词检索（FTS5）</h2>
          {keyword_raw.length === 0 ? (
            <div className="text-[#68736d] text-sm">无结果</div>
          ) : (
            <div className="space-y-2">
              {keyword_raw.map((k, i) => (
                <div key={k.id} className="text-xs border-b border-[#e8edea] pb-2 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#16745b] font-semibold">#{i + 1}</span>
                    <span className="text-[#68736d]">score={(k.score ?? 0).toFixed(3)}</span>
                    <span className="text-[#68736d] text-[10px]">id={k.id}</span>
                  </div>
                  <div className="text-gray-600 line-clamp-2">{k.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
