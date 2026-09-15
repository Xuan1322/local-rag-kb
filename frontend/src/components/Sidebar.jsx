import { NavLink } from "react-router-dom";

const items = [
  { to: "/app", label: "知识空间", icon: "📚" },
  { to: "/app/search", label: "搜索测试", icon: "🔍" },
  { to: "/app/settings", label: "设置", icon: "⚙️" },
];

export default function Sidebar({ user, onLogout }) {
  return (
    <aside className="w-56 shrink-0 bg-[#eaf1eb] border-r border-[#dfe6e0] sticky top-0 h-screen flex flex-col">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#16745b] flex items-center justify-center text-white text-sm font-bold">
            R
          </span>
          <div>
            <div className="font-bold text-sm">RAG KB</div>
            <div className="text-[11px] text-[#68736d]">本地知识库</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-white text-[#16745b] font-semibold shadow-sm"
                  : "text-[#59665e] hover:text-[#16745b] hover:bg-white/70"
              }`
            }
          >
            <span className="mr-2">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-[#d5e1d7]">
        <div className="px-5 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#16745b] text-white text-xs font-bold flex items-center justify-center">
            {user?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#2d4a3a] truncate">
              {user?.username || "用户"}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full px-5 py-2 text-[11px] text-[#68736d] hover:text-red-600 hover:bg-white/50 text-left transition"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
