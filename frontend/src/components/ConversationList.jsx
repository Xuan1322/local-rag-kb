/**
 * 空间内的对话历史列表（左栏上半部分）
 */
export default function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
}) {
  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${d.getMonth() + 1}-${d.getDate()}`;
  };

  return (
    <div className="flex flex-col min-h-0 h-[42%] border-b border-[#e8edea]">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#68736d] tracking-wide">对话</span>
        <button
          onClick={onNew}
          className="text-[11px] font-semibold text-[#16745b] hover:bg-[#edf3ee] px-2 py-0.5 rounded"
          title="新建对话"
        >
          + 新对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading ? (
          <div className="text-[11px] text-[#9aa59e] px-2 py-2">加载中...</div>
        ) : conversations.length === 0 ? (
          <div className="text-[11px] text-[#9aa59e] px-2 py-2 leading-relaxed">
            还没有对话，输入问题后会自动保存到这里
          </div>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`group px-2.5 py-2 rounded-lg cursor-pointer transition flex items-start gap-2 ${
                  active ? "bg-[#edf3ee] ring-1 ring-[#16745b]/20" : "hover:bg-[#f5f7f3]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[12.5px] truncate leading-snug ${
                      active ? "text-[#16745b] font-semibold" : "text-[#2d3a33] font-medium"
                    }`}
                  >
                    {c.title || "未命名对话"}
                  </div>
                  <div className="text-[10px] text-[#9aa59e] mt-0.5">
                    {formatTime(c.updated_at)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("删除这条对话？")) onDelete(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-[#9aa59e] hover:text-red-500 hover:bg-red-50 rounded"
                  title="删除对话"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
