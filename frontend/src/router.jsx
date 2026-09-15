import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import SpaceList from "./pages/SpaceList.jsx";
import SpaceDetail from "./pages/SpaceDetail.jsx";
import SearchTest from "./pages/SearchTest.jsx";
import Settings from "./pages/Settings.jsx";
import Welcome from "./pages/Welcome.jsx";
import Guide from "./pages/Guide.jsx";
import Login from "./pages/Login.jsx";
import { useState, useEffect } from "react";

export function Router() {
  const location = useLocation();
  const [backendReady, setBackendReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [onboarded, setOnboarded] = useState(null); // null=未知 / true / false

  useEffect(() => {
    // 并行检查后端健康 + 认证状态
    Promise.all([
      fetch("/api/health").then((r) => r.ok).catch(() => false),
      (async () => {
        const token = localStorage.getItem("rag_token");
        if (!token) return null;
        try {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) return await res.json();
          // token 无效 → 清除
          localStorage.removeItem("rag_token");
          localStorage.removeItem("rag_user");
        } catch {
          // 网络错误，不清除 token
        }
        return null;
      })(),
    ]).then(([ok, userData]) => {
      setBackendReady(ok);
      setUser(userData);
      if (userData) {
        localStorage.setItem("rag_user", JSON.stringify(userData));
      }
      setAuthChecked(true);
    });
  }, []);

  // 登录态确定后，拉取 onboarding 状态（刷新恢复和刚登录都会触发）
  useEffect(() => {
    if (!user) {
      setOnboarded(null);
      return;
    }
    const token = localStorage.getItem("rag_token");
    fetch("/api/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setOnboarded(data ? !!data.has_onboarded : true))
      .catch(() => setOnboarded(true));
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("rag_token");
    localStorage.removeItem("rag_user");
    setUser(null);
  };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  }

  // 后端没启动
  if (!backendReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[#f4f6f2]">
        <div className="max-w-md bg-white border border-red-300 rounded-xl p-6 text-center">
          <p className="text-red-600 font-semibold">后端未启动</p>
          <p className="text-gray-600 mt-2 text-sm">
            请在项目根目录运行 start.bat
          </p>
        </div>
      </div>
    );
  }

  // 已登录但 onboarding 状态未知（正在拉取），先别渲染主界面防止闪现
  const needsOnboardingCheck = user && onboarded === null;
  const isAppRoute = location.pathname.startsWith("/app");
  if (needsOnboardingCheck && isAppRoute) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  }

  return (
    <Routes>
      {/* 公开路由 */}
      <Route
        path="/"
        element={user ? <Navigate to="/app" replace /> : <Welcome />}
      />
      <Route
        path="/login"
        element={user ? <Navigate to="/app" replace /> : <Login onLoggedIn={setUser} />}
      />

      {/* 引导页（需登录） */}
      <Route
        path="/guide"
        element={user ? <Guide /> : <Navigate to="/login" replace />}
      />

      {/* 主界面（需登录，带侧边栏）；未完成引导的新用户先进引导 */}
      <Route
        path="/app/*"
        element={
          user ? (
            onboarded === false ? (
              <Navigate to="/guide" replace />
            ) : (
              <div className="flex min-h-screen bg-[#f5f7f3]">
                <Sidebar user={user} onLogout={handleLogout} />
                <main className="flex-1 min-w-0">
                  <Routes>
                    <Route path="/" element={<SpaceList />} />
                    <Route path="/spaces/:id" element={<SpaceDetail />} />
                    <Route path="/search" element={<SearchTest />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </main>
              </div>
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 兜底 */}
      <Route path="*" element={<Navigate to={user ? "/app" : "/"} replace />} />
    </Routes>
  );
}
