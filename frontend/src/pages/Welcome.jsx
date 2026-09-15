import { Link } from "react-router-dom";

/**
 * 公开落地页（未登录可见）
 * 告诉用户：这个平台是做什么的、怎么开始
 */
export default function Welcome() {
  return (
    <div className="min-h-screen bg-[#f4f6f2]">
      <div className="max-w-7xl mx-auto px-8 lg:px-16 py-10 min-h-screen flex flex-col">
        {/* 顶栏品牌 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#16745b] rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-md shadow-[#16745b]/20">
              R
            </div>
            <div>
              <div className="font-bold text-xl text-gray-900 leading-tight">RAG KB</div>
              <div className="text-xs text-[#8a948e] tracking-wide">本地轻量知识库</div>
            </div>
          </div>
          <Link
            to="/login"
            className="text-sm font-semibold text-[#16745b] hover:text-[#125f4a] px-4 py-2 rounded-lg hover:bg-white/70 transition"
          >
            登录
          </Link>
        </div>

        {/* 主体 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-10">
          {/* 左侧文案 */}
          <div>
            <h1 className="text-[44px] lg:text-[56px] font-black leading-[1.18] mb-8 text-gray-900 tracking-tight">
              把散落的资料
              <br />
              变成会
              <span className="relative z-0 inline-block text-[#16745b]">
                回答问题
                <span className="absolute left-0 right-0 bottom-1 h-3 bg-[#16745b]/15 -z-10 rounded-sm" />
              </span>
              的第二大脑
            </h1>

            <p className="text-[#5d6862] text-lg leading-[1.9] mb-10 max-w-xl">
              上传 PDF、Word、文本文件，RAG KB 会自动解析、分块并建立索引。
              提问时，它先检索你的资料，再生成带来源引用的回答——不再凭空猜测。
            </p>

            <div className="flex items-center gap-4 mb-10">
              <Link
                to="/login?mode=register"
                className="px-9 py-4 bg-[#16745b] text-white font-bold rounded-2xl hover:bg-[#125f4a] transition shadow-lg shadow-[#16745b]/25 text-base"
              >
                开始使用 →
              </Link>
              <Link
                to="/login?mode=login"
                className="px-9 py-4 bg-white text-gray-800 font-bold rounded-2xl border border-[#dde3dd] hover:border-[#16745b] hover:text-[#16745b] transition text-base"
              >
                我已有账号
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#8a948e]">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16745b]" />
                多用户数据隔离
              </span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16745b]" />
                数据仅存本地
              </span>
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16745b]" />
                支持 PDF · Word · 文本
              </span>
            </div>
          </div>

          {/* 右侧：层叠产品卡片 */}
          <div className="relative h-[480px] hidden lg:block">
            {/* 卡片 1：文档（后层） */}
            <div
              className="absolute top-0 right-4 w-[420px] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(22,116,91,0.18)] border border-[#e8edea] p-6"
              style={{ transform: "rotate(-2deg)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#fdece8] flex items-center justify-center text-[#d9533f] font-black text-sm">
                  MD
                </div>
                <div>
                  <div className="font-bold text-gray-900">产品需求文档.md</div>
                  <div className="text-xs text-[#8a948e] mt-0.5">已解析 · 24 页 · 42 个分块</div>
                </div>
              </div>
              <div className="border-t border-dashed border-[#e0e5e0] mt-4 pt-4 space-y-1.5">
                <div className="text-sm text-[#5d6862] font-medium">混合检索：Embedding 召回 Top-20，</div>
                <div className="text-sm text-[#5d6862] font-medium">关键词补全，RRF 融合精排</div>
              </div>
            </div>

            {/* 卡片 2：问答（中层） */}
            <div
              className="absolute top-[160px] right-0 w-[400px] bg-white rounded-2xl shadow-[0_24px_70px_-12px_rgba(22,116,91,0.25)] border border-[#e8edea] p-6"
              style={{ transform: "rotate(1.5deg)" }}
            >
              <div className="inline-block bg-[#e4f2ec] text-[#16745b] text-sm font-semibold px-3.5 py-1.5 rounded-full mb-4">
                混合检索解决什么问题？
              </div>
              <p className="text-[14.5px] text-[#4a554f] leading-[1.85]">
                主要是数据规模增大后的检索效果衰减问题：单纯向量召回会稀释相关性，加入关键词 RRF
                融合后可稳定提升命中质量
                <span className="inline-flex gap-1 align-middle ml-1">
                  <span className="bg-[#16745b] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded">1</span>
                  <span className="bg-[#16745b] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded">2</span>
                </span>
              </p>
            </div>

            {/* 卡片 3：统计（前层） */}
            <div className="absolute bottom-0 left-2 w-[280px] bg-white rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.12)] border border-[#e8edea] px-7 py-6">
              <div className="text-[40px] font-black text-[#16745b] leading-none tracking-tight">
                12,480
              </div>
              <div className="text-sm text-[#8a948e] mt-2 mb-4">已索引文本块</div>
              <div className="h-2 bg-[#edf0eb] rounded-full overflow-hidden">
                <div className="h-full w-[68%] bg-gradient-to-r from-[#2a9d7b] to-[#16745b] rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
