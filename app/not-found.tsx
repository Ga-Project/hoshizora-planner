// 星空撮影プランナー — 404。static export では out/404.html に書き出される（GitHub Pages 404）。
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — 星空撮影プランナー",
  robots: { index: false, follow: false },
};

// サブパス配信では絶対パス "/" がドメイン直下に解決されてしまうため、
// ビルド時の basePath を前置してプロダクトのトップへ戻す。
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function NotFound() {
  return (
    <main className="doc">
      <h1>404</h1>
      <p>お探しのページは見つかりませんでした。</p>
      <p style={{ marginTop: 16 }}>
        <a className="doc__back" href={`${base}/`}>
          ← 星空撮影プランナーのトップへ
        </a>
      </p>
    </main>
  );
}
