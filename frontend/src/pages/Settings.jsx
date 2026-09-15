import { useState, useEffect } from "react";
import { settingsApi, chatApi } from "../api/chat.js";

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok: bool, message: string }

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => setSettings({}));
  }, []);

  if (!settings) {
    return <div className="text-center text-[#68736d] p-12">加载中...</div>;
  }

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      const data = { ...settings };
      if (data.llm_api_key === "******") {
        delete data.llm_api_key;
      }
      const updated = await settingsApi.update(data);
      setSettings(updated);
      setSavedMsg("✓ 已保存");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch (e) {
      setSavedMsg("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await chatApi.testLLM({
        llm_api_key: settings.llm_api_key || "",
        llm_base_url: settings.llm_base_url || "",
        llm_model: settings.llm_model || "",
      });
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, message: "请求失败: " + e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">设置</h1>
      <p className="text-[#68736d] mb-8">
        配置大模型 API Key 后，就可以让 AI 基于你的资料回答问题了
      </p>

      {/* LLM 配置 */}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-6 mb-6">
        <h2 className="font-bold text-lg mb-1">大模型配置</h2>
        <p className="text-[11px] text-[#68736d] mb-5">
          支持 OpenAI 兼容格式的 API（DeepSeek、OpenAI、本地 vLLM / LM Studio 等）
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Base URL *</label>
            <input
              type="text"
              value={settings.llm_base_url || ""}
              onChange={(e) => setSettings({ ...settings, llm_base_url: e.target.value })}
              placeholder="例如：https://api.deepseek.com/v1"
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
            <div className="text-[11px] text-[#68736d] mt-1">
              OpenAI: https://api.openai.com/v1 · DeepSeek: https://api.deepseek.com/v1
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">API Key *</label>
            <input
              type="password"
              value={settings.llm_api_key || ""}
              onChange={(e) => setSettings({ ...settings, llm_api_key: e.target.value })}
              placeholder="sk-..."
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
            {settings.llm_configured && !settings.llm_api_key && (
              <div className="text-[11px] text-green-600 mt-1">✓ 已配置（留空则保持不变）</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">模型名 *</label>
            <input
              type="text"
              value={settings.llm_model || ""}
              onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })}
              placeholder="例如：deepseek-chat / gpt-4o-mini"
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
            <div className="mt-2">
              <div className="text-[11px] text-[#68736d] mb-1.5">快速填入（免费模型，需 OpenRouter API Key）</div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSettings({
                    ...settings,
                    llm_base_url: "https://openrouter.ai/api/v1",
                    llm_model: "nex-agi/nex-n2.5-mini:free",
                  })}
                  className="text-[11px] px-2.5 py-1 border border-[#16745b] bg-[#edf3ee] rounded-md hover:bg-[#d6e7dd] transition-colors font-semibold"
                  title="Nex N2.5 Mini — 实测最快 1.7s，3 轮全成功无限流"
                >
                  Nex-N2.5-Mini（最快）
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({
                    ...settings,
                    llm_base_url: "https://openrouter.ai/api/v1",
                    llm_model: "nvidia/nemotron-3-ultra-550b-a55b:free",
                  })}
                  className="text-[11px] px-2.5 py-1 border border-[#dfe6e0] rounded-md hover:bg-[#edf3ee] hover:border-[#16745b] transition-colors"
                  title="NVIDIA Nemotron 3 Ultra — 质量最好，1M 超长上下文"
                >
                  Nemotron 3 Ultra（高质量）
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({
                    ...settings,
                    llm_base_url: "https://openrouter.ai/api/v1",
                    llm_model: "openrouter/free",
                  })}
                  className="text-[11px] px-2.5 py-1 border border-[#dfe6e0] rounded-md hover:bg-[#edf3ee] hover:border-[#16745b] transition-colors"
                  title="路由器 — 自动从免费池分配，稳定性兜底"
                >
                  openrouter/free（兜底）
                </button>
              </div>
              <div className="text-[10px] text-[#68736d] mt-1.5">
                API Key 从 <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">openrouter.ai/keys</a> 获取
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 检索参数 */}
      <div className="bg-white border border-[#dfe6e0] rounded-xl p-6 mb-6">
        <h2 className="font-bold text-lg mb-5">检索参数</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Top K <span className="text-[11px] text-[#68736d]">（返回几个片段）</span>
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.top_k ?? 5}
              onChange={(e) => setSettings({ ...settings, top_k: parseInt(e.target.value) || 5 })}
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              相似度阈值 <span className="text-[11px] text-[#68736d]">（0-100，仅搜索测试页参考）</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.similarity_threshold ?? 15}
              onChange={(e) => setSettings({ ...settings, similarity_threshold: parseInt(e.target.value) || 15 })}
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
            <div className="text-[11px] text-[#68736d] mt-1">
              问答策略：只要在资料中检索到相关内容就会回答，由模型自行判断依据是否充分
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Temperature <span className="text-[11px] text-[#68736d]">（0-10，越高越发散）</span>
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.temperature ?? 7}
              onChange={(e) => setSettings({ ...settings, temperature: parseInt(e.target.value) || 7 })}
              className="w-full border border-[#dfe6e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#16745b]"
            />
          </div>
        </div>
      </div>

      {/* 测试 + 保存按钮 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-[#16745b] text-white rounded-lg font-semibold hover:bg-[#125f4a] disabled:opacity-50 text-sm"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2.5 border border-[#16745b] text-[#16745b] rounded-lg font-semibold hover:bg-[#edf3ee] disabled:opacity-50 text-sm"
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
          {savedMsg && (
            <span className={savedMsg.startsWith("✓") ? "text-green-600 text-sm" : "text-red-600 text-sm"}>
              {savedMsg}
            </span>
          )}
        </div>
        {testResult && (
          <div
            className={`text-sm px-4 py-2.5 rounded-lg border ${
              testResult.ok
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {testResult.ok ? "✓ " : "✗ "}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
