// 公開 URL の単一の出どころ。
// canonical・OGP 画像の絶対 URL（metadataBase）・sitemap / robots が同じ URL を指すよう、
// ここ一箇所で組み立てる。プロジェクトページ配信では basePath がパスに乗るため、
// pages.yml が渡す NEXT_PUBLIC_BASE_PATH を末尾に連結する（next.config.mjs と同じ env）。
// 前提: out/ を公開配信するのは NEXT_PUBLIC_BASE_PATH を渡す CI 経路だけ。

const ORIGIN = "https://ga-project.github.io";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** 公開サイトのルート URL（末尾スラッシュ付き。trailingSlash: true の出力に合わせる）。 */
export const SITE_URL = `${ORIGIN}${BASE_PATH}/`;

/** SNS カード画像（public/og.png）。url は metadataBase 起点の相対。 */
export const OG_IMAGE = {
  url: "og.png",
  width: 1200,
  height: 630,
  alt: "星空撮影プランナーの表示例。東京・7月15日の夜、天の川の中心は21:50ごろ南の高度25度に見える",
};
