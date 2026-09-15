// 文件类型相关的前端公共方法（与后端 parser_service.SUPPORTED_EXTENSIONS 对齐）
export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

// 上传控件的 accept
export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp";

export function extOf(filename = "") {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isImage(filename = "") {
  return IMAGE_EXTS.includes(extOf(filename));
}

export function fileIcon(filename = "") {
  const ext = extOf(filename);
  if (ext === ".pdf") return { emoji: "📕", bg: "bg-red-50", color: "text-red-600" };
  if (ext === ".docx") return { emoji: "📘", bg: "bg-blue-50", color: "text-blue-600" };
  if (isImage(filename)) return { emoji: "🖼️", bg: "bg-purple-50", color: "text-purple-600" };
  return { emoji: "📝", bg: "bg-gray-50", color: "text-gray-600" };
}

export const parserService = { isImage, fileIcon };
