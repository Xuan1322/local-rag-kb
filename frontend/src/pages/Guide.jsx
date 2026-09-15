import { useState, useRef } from "react";
import { spacesApi, documentsApi } from "../api/index.js";
import { chatApi } from "../api/chat.js";

export default function Guide() {
  const [step, setStep] = useState(1);
  const [spaceName, setSpaceName] = useState("");
  const [spaceDesc, setSpaceDesc] = useState("");
  const [spaceId, setSpaceId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [llmKey, setLlmKey] = useState("");
  const [llmUrl, setLlmUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // {ok, message}
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [uploadedNames, setUploadedNames] = useState([]);
  const fileInputRef = useRef(null);

  const TOTAL = 3;

  // Step 1 的「上一步」：退出当前账号回到登录页
  // （未完成引导时跳首页会被路由重新弹回 /guide，必须先清登录态）
  const handleExitToLogin = () => {
    localStorage.removeItem("rag_token");
    localStorage.removeItem("rag_user");
    window.location.href = "/login";
  };

  // Step 1 → Step 2
  const handleCreateSpace = async () => {
    if (!spaceName.trim()) return;
    try {
      const s = await spacesApi.create({
        name: spaceName.trim(),
        description: spaceDesc.trim() || null,
      });
      setSpaceId(s.id);
      setStep(2);
    } catch (e) {
      alert("创建失败: " + e.message);
    }
  };

  // Step 2 上传
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !spaceId) return;
    setUploading(true);
    try {
      for (const f of files) {
        await documentsApi.upload(spaceId, f);
        setUploadedNames((prev) => [...prev, f.name]);
      }
    } catch (err) {
      alert("上传失败: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Step 2 → Step 3
  const goToStep3 = () => setStep(3);

  // Step 3 测试
  const handleTest = async () => {
    if (!llmKey || !llmUrl || !llmModel) {
      setTestResult({ ok: false, message: "请填写完整" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await chatApi.testLLM({
        llm_api_key: llmKey,
        llm_base_url: llmUrl,
        llm_model: llmModel,
      });
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, message: "请求失败" });
    } finally {
      setTesting(false);
    }
  };

  // 完成引导
  const handleFinish = async () => {
    setSaving(true);
    try {
      await chatApi.updateSettings({
        llm_api_key: llmKey || undefined,
        llm_base_url: llmUrl || undefined,
        llm_model: llmModel || undefined,
        has_onboarded: true,
      });
      setDone(true);
      setTimeout(() => { window.location.href = "/app"; }, 1500);
    } catch (e) {
      alert("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 3 → 跳过 LLM
  const handleSkipLLM = async () => {
    setSaving(true);
    try {
      await chatApi.updateSettings({ has_onboarded: true });
      setDone(true);
      setTimeout(() => { window.location.href = "/app"; }, 1500);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const progress = (step / TOTAL) * 100;

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7f3]">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">引导完成</h2>
          <p className="text-[#68736d]">正在进入主界面...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f7f3] to-white flex items-center justify-center p-8">
      <div className="max-w-xl w-full">
        {/* 顶部进度 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[#68736d] font-semibold">
              第 {step} 步 · 共 {TOTAL} 步
            </div>
            <div className="text-sm text-[#16745b] font-semibold">{Math.round(progress)}%</div>
          </div>
          <div className="h-2 bg-[#e8edea] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#16745b] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#e8edea] p-8">
          {step === 1 && (
            <div>
              {spaceId ? (
                <>
                  <div className="text-4xl mb-4">✅</div>
                  <h2 className="text-2xl font-bold mb-2">空间已创建</h2>
                  <p className="text-[#68736d] text-sm mb-6">
                    知识空间
                    <span className="font-semibold text-[#16745b]">「{spaceName.trim()}」</span>
                    已就绪，下一步为它导入第一批资料。
                  </p>
                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={handleExitToLogin}
                      className="px-5 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] transition whitespace-nowrap"
                    >
                      ← 上一步
                    </button>
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-3 bg-[#16745b] text-white font-semibold rounded-xl hover:bg-[#125f4a] transition"
                    >
                      下一步 →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-4">📚</div>
                  <h2 className="text-2xl font-bold mb-2">创建你的第一个知识空间</h2>
                  <p className="text-[#68736d] text-sm mb-6">
                    知识空间是存放相关资料的容器。你可以按主题、项目或团队来划分。
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        空间名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={spaceName}
                        onChange={(e) => setSpaceName(e.target.value)}
                        placeholder="例如：项目资料、学习笔记、市场调研"
                        className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:border-[#16745b] focus:ring-2 focus:ring-[#16745b]/10"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                        描述（可选）
                      </label>
                      <textarea
                        value={spaceDesc}
                        onChange={(e) => setSpaceDesc(e.target.value)}
                        placeholder="简单描述这个空间里放什么资料"
                        rows={2}
                        className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:border-[#16745b] focus:ring-2 focus:ring-[#16745b]/10 resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={handleExitToLogin}
                      className="px-5 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] transition whitespace-nowrap"
                    >
                      ← 上一步
                    </button>
                    <button
                      onClick={handleCreateSpace}
                      disabled={!spaceName.trim()}
                      className="flex-1 py-3 bg-[#16745b] text-white font-semibold rounded-xl hover:bg-[#125f4a] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      创建空间 →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="text-4xl mb-4">📄</div>
              <h2 className="text-2xl font-bold mb-2">导入第一批资料</h2>
              <p className="text-[#68736d] text-sm mb-6">
                支持 PDF、Word、纯文本与图片（自动 OCR 识别文字）。系统会自动解析、切分并建立索引。
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-8 border-2 border-dashed border-[#dfe6e0] rounded-xl hover:border-[#16745b] hover:bg-[#f9faf8] transition text-center disabled:opacity-50"
              >
                <div className="text-3xl mb-2">📁</div>
                <div className="text-sm font-semibold text-[#59665e]">
                  {uploading ? "上传中..." : "点击选择文件，或拖拽到这里"}
                </div>
                <div className="text-xs text-[#68736d] mt-1">
                  PDF · Word · 文本 · Markdown · 图片 OCR
                </div>
              </button>

              {uploadedNames.length > 0 && (
                <div className="mt-3 space-y-1">
                  {uploadedNames.map((n, i) => (
                    <div key={i} className="text-xs text-[#16745b] bg-[#edf3ee] rounded-md px-3 py-1.5 truncate">
                      ✓ {n}
                    </div>
                  ))}
                  <div className="text-[11px] text-[#68736d]">
                    已选 {uploadedNames.length} 个文件，进入空间后可查看解析进度
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(1)}
                  disabled={uploading}
                  className="px-5 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] disabled:opacity-50 transition whitespace-nowrap"
                >
                  ← 上一步
                </button>
                <button
                  onClick={goToStep3}
                  disabled={uploading}
                  className="flex-1 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] disabled:opacity-50 transition"
                >
                  跳过，稍后导入
                </button>
                <button
                  onClick={goToStep3}
                  disabled={uploading}
                  className="flex-1 py-3 bg-[#16745b] text-white font-semibold rounded-xl hover:bg-[#125f4a] disabled:opacity-50 transition"
                >
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="text-4xl mb-4">⚙️</div>
              <h2 className="text-2xl font-bold mb-2">配置大模型</h2>
              <p className="text-[#68736d] text-sm mb-6">
                需要一个 LLM API 才能生成回答。支持任何 OpenAI 兼容格式的 API。
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={llmUrl}
                    onChange={(e) => setLlmUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                    className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:border-[#16745b]"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={llmKey}
                    onChange={(e) => setLlmKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:border-[#16745b]"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                    模型名
                  </label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder="deepseek-chat"
                    className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:border-[#16745b]"
                  />
                </div>

                {/* 测试按钮 */}
                <button
                  onClick={handleTest}
                  disabled={testing || (!llmKey || !llmUrl || !llmModel)}
                  className="w-full py-2.5 border border-[#dfe6e0] text-sm text-[#59665e] font-semibold rounded-lg hover:bg-[#f5f7f3] disabled:opacity-40 transition"
                >
                  {testing ? "测试中..." : "🔌 测试连接"}
                </button>

                {/* 测试结果 */}
                {testResult && (
                  <div
                    className={`text-sm px-4 py-2.5 rounded-lg ${
                      testResult.ok
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(2)}
                  disabled={saving}
                  className="px-5 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] disabled:opacity-50 transition whitespace-nowrap"
                >
                  ← 上一步
                </button>
                <button
                  onClick={handleSkipLLM}
                  disabled={saving}
                  className="flex-1 py-3 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-xl hover:bg-[#f5f7f3] disabled:opacity-50 transition"
                >
                  先跳过
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 py-3 bg-[#16745b] text-white font-semibold rounded-xl hover:bg-[#125f4a] disabled:opacity-50 transition"
                >
                  {saving ? "保存中..." : "完成 →"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="text-center mt-6 text-xs text-[#68736d]">
          设置可随时在「⚙️ 设置」页面修改
        </div>
      </div>
    </div>
  );
}
