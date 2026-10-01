import type { MetadataRoute } from "next";

// 静态导出要求显式声明
export const dynamic = "force-static";

/**
 * PWA 清单：静态导出，CI 通过 BASE_PATH 注入子路径。
 * 装到主屏后全屏启动，无浏览器地址栏。
 */
const basePath = process.env.BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "归零 Zero",
    short_name: "归零",
    description: "一片可以把情绪丢进去的浩瀚深空。",
    lang: "zh-CN",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#020111",
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
