import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SITE_URL } from "./site";

const title = "星空撮影プランナー — 天の川が今夜いつ・どの方角に見えるか";
const description =
  "撮影地と日付を選ぶだけで、天の川の中心が今夜いつ・どの方角に・どの高さで見えるかを一画面で表示。月明かりの影響もわかる、日本語の星景撮影プランナー（ブラウザ完結・登録不要）。";

const ogImage = {
  url: "og.png",
  width: 1200,
  height: 630,
  alt: "星空撮影プランナー — 天の川の中心が今夜いつ・どの方角に見えるか",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title,
  description,
  applicationName: "星空撮影プランナー",
  keywords: [
    "天の川",
    "撮影",
    "星景写真",
    "方角",
    "時間",
    "月齢",
    "プランナー",
  ],
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ja_JP",
    siteName: "星空撮影プランナー",
    url: SITE_URL,
    images: [ogImage],
  },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  robots: { index: true, follow: true },
};

// 構造化データ（サイト全体で真であるものだけ）。
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "星空撮影プランナー",
  url: SITE_URL,
  description,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  inLanguage: "ja",
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
}).replace(/</g, "\\u003c");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        {/* アクセス解析（cookieless・秘密キー不要）: 全プロダクト共通の単一 GoatCounter サイト
            「ga-project」に集約する。製品ごとの数値は path（/hoshizora-planner/）で区別される。 */}
        <script
          data-goatcounter="https://ga-project.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
        />
        {children}
      </body>
    </html>
  );
}
