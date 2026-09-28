import type { NextConfig } from "next";

/**
 * GitHub Pages 项目站部署在子路径下：https://用户名.github.io/仓库名/
 * CI 中通过环境变量 BASE_PATH 注入（值为 "/仓库名"），本地开发留空。
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // 纯静态导出：构建产物为 out/ 下的 HTML/JS/CSS
  output: "export",
  basePath,
  // 静态导出不支持 Next 图片优化
  images: { unoptimized: true },
  // 生成 /index.html 形式，兼容静态服务器
  trailingSlash: true,
};

export default nextConfig;
