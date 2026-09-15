# RAG KB · 本地轻量知识库

把散落的 PDF、Word、文本和图片资料，变成会**基于你的资料回答问题**的第二大脑。
全流程在本地运行：文档解析 → 动态分块 → 向量化 + 关键词索引 → 混合检索 → LLM 流式生成带引用的回答。

## 功能特性

- 📄 **多格式解析**：PDF、Word（.docx）、TXT、Markdown
- 🖼️ **图片 OCR**：PNG / JPG / WebP / BMP 自动离线识别中英文文字（RapidOCR ONNX，无需联网）
- ✂️ **动态分块**：按文件大小/文字量自动选择 300/400/600/800 字分块，小文件切得准、大文件上下文完整
- 🔀 **混合检索**：bge-small-zh 向量召回 + FTS 关键词召回，RRF 融合排序，兼顾语义与精确匹配
- 💬 **聊天附件**：提问时可临时挂文件/图片，检索自动限定在附件范围内；附件随消息持久化
- 🔐 **多用户隔离**：JWT 登录，不同用户的空间、文档、向量库互不可见
- 📚 **知识空间**：按主题/项目组织资料，对话与引用来源可回溯
- ⚙️ **兼容任何 OpenAI 协议的 LLM**：DeepSeek、OpenAI、本地 vLLM / LM Studio 等

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Tailwind CSS |
| 后端 | FastAPI + SQLAlchemy + Uvicorn |
| 数据库 | SQLite（业务数据 / FTS5 全文索引） |
| 向量库 | ChromaDB（本地持久化） |
| Embedding | BAAI/bge-small-zh-v1.5（sentence-transformers） |
| OCR | RapidOCR（onnxruntime，离线） |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+（含 npm）

### 1. 启动后端

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765
```

首次使用 Embedding / OCR 时会自动下载模型（Embedding 约 100MB，OCR ONNX 模型随包内置）。

### 2. 启动前端

```powershell
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 ，注册账号后按引导完成：创建空间 → 导入资料 → 配置大模型。

### Windows 一键启动

也可以直接双击 `start.bat`，会自动检查依赖并分别启动前后端。

## 配置大模型

在「设置」页填写（兼容 OpenAI Chat Completions 协议）：

- **Base URL**：如 `https://api.deepseek.com/v1`
- **API Key**：你的密钥（仅保存在本地数据库）
- **模型名**：如 `deepseek-chat`

Key 不上传到任何第三方，问答请求由你的后端直接发往你配置的 API 地址。

## 项目结构

```
.
├── backend/
│   ├── app/
│   │   ├── routers/        # 认证 / 空间 / 文档 / 问答(SSE) / 设置
│   │   ├── services/       # 解析、分块、向量、关键词、RRF 检索、RAG 引擎
│   │   ├── models/         # SQLAlchemy 模型
│   │   └── config.py       # 路径、端口、检索参数等配置
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   └── src/
│       ├── pages/          # 登录、引导、空间、聊天、搜索测试、设置
│       ├── components/     # 侧边栏、文档预览弹窗等
│       └── api/            # 后端接口封装
├── data/                   # 运行时数据（不入库；含 SQLite、Chroma、上传文件）
├── docs/                   # 技术方案文档
└── start.bat               # Windows 一键启动
```

## 检索与上下文策略

采用**检索片段作为上下文**（非整篇文件）：向量 top10 + 关键词 top10 经 RRF（k=60）融合后取 top5 片段送入 LLM；聊天框附件通过 `document_id` 范围过滤实现，避免整篇文件超出 token 上限并稀释重点。

## 数据与隐私

- 所有资料、向量索引、账号数据均保存在本地 `data/` 目录（已从版本库忽略）
- JWT 默认密钥仅用于本地开发，生产部署请通过环境变量覆盖：

```powershell
$env:JWT_SECRET="你的随机密钥"
```
