import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

/** CI 构建时通过 BASE_PATH 注入 GitHub Pages 子路径，本地开发为空 */
const basePath = process.env.BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "归零 Zero",
  description: "一片可以把情绪丢进去的浩瀚深空。",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${basePath}/icon.svg`, type: "image/svg+xml" },
      { url: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: `${basePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "归零",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#020111",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 刘海屏 / Home 指示条：允许页面延伸到安全区，由 env(safe-area-inset-*) 自行避让
  viewportFit: "cover",
};

/**
 * Chunk 加载失败自救（必须早于应用 bundle 执行，故内联在 body 首）。
 *
 * 场景：微信等内置浏览器会缓存旧 HTML，新版本部署后旧 hash 的
 * _next/static 资源已被删除（404），页面直接白屏且不会自愈。
 * 监听到静态资源加载失败 / 动态模块拒绝时，带 cache-bust 查询强制重载一次；
 * sessionStorage 标记保证最多自救一次，页面健康活过 8s 后清除标记。
 */
const CHUNK_RESCUE_SCRIPT = `(function(){
  try{
    var KEY='zero:chunk-reload';
    function rescue(){
      try{ if(sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY,'1'); }catch(e){}
      var u=new URL(location.href);
      u.searchParams.set('_r',String(Date.now()));
      location.replace(u.href);
    }
    window.addEventListener('error',function(e){
      var t=e.target;
      if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){
        var url=t.src||t.href||'';
        if(url.indexOf('/_next/static/')>-1) rescue();
      }
    },true);
    window.addEventListener('unhandledrejection',function(e){
      var m=e.reason&&(e.reason.message||e.reason.name)||String(e.reason);
      if(/Loading (CSS )?chunk|dynamically imported module|ChunkLoadError/i.test(String(m))) rescue();
    });
    setTimeout(function(){ try{sessionStorage.removeItem(KEY);}catch(e){} },8000);
  }catch(e){}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full overflow-hidden bg-black">
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RESCUE_SCRIPT }} />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
