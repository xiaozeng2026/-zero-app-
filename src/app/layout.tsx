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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full overflow-hidden bg-black">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
