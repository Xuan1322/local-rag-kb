import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function Login({ onLoggedIn }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState(
    searchParams.get("mode") === "register" ? "register" : "login"
  ); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    if (mode === "register") {
      if (password.length < 4) {
        setError("密码至少 4 位");
        return;
      }
      if (password !== confirm) {
        setError("两次密码不一致");
        return;
      }
    }

    const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      setLoading(true);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "操作失败");
        return;
      }

      localStorage.setItem("rag_token", data.token);
      localStorage.setItem("rag_user", JSON.stringify(data.user));
      onLoggedIn(data.user);
      navigate("/app");
    } catch (err) {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f7f3] via-white to-[#edf3ee] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* 品牌 */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 bg-[#16745b] rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            R
          </div>
          <div>
            <div className="font-bold text-xl text-gray-900">RAG KB</div>
            <div className="text-xs text-[#68736d]">本地轻量知识库</div>
          </div>
        </div>

        {/* 卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#e8edea] p-8">
          {/* Tab 切换 */}
          <div className="flex gap-1 bg-[#f0f6f3] p-1 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-[#16745b] shadow-sm"
                  : "text-[#68736d] hover:text-[#16745b]"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                mode === "register"
                  ? "bg-white text-[#16745b] shadow-sm"
                  : "text-[#68736d] hover:text-[#16745b]"
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#59665e] mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="至少 2 位"
                className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16745b]/30 focus:border-[#16745b]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#59665e] mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 4 位"
                className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16745b]/30 focus:border-[#16745b]"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-[#59665e] mb-1.5">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  className="w-full px-4 py-2.5 border border-[#dfe6e0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16745b]/30 focus:border-[#16745b]"
                />
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate("/")}
                disabled={loading}
                className="px-5 py-2.5 border border-[#dfe6e0] text-[#59665e] font-semibold rounded-lg hover:bg-[#f5f7f3] disabled:opacity-50 transition whitespace-nowrap"
              >
                ← 上一步
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-[#16745b] text-white font-semibold rounded-lg hover:bg-[#125f4a] transition disabled:opacity-50"
              >
                {loading
                  ? "处理中..."
                  : mode === "login"
                  ? "登录 →"
                  : "注册 →"}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-6">
          <p className="text-[11px] text-[#68736d]">
            数据仅存本地，不同账号各自独立
          </p>
        </div>
      </div>
    </div>
  );
}
