// 公開 URL の単一の出どころ。
// canonical・OGP 画像の絶対 URL（metadataBase）・sitemap / robots が同じ URL を指すよう、
// ここ一箇所で組み立てる。プロジェクトページ配信では basePath がパスに乗るため、
// pages.yml が渡す NEXT_PUBLIC_BASE_PATH を末尾に連結する（next.config.mjs と同じ env）。
// 前提: out/ を公開配信するのは NEXT_PUBLIC_BASE_PATH を渡す CI 経路だけ。

const ORIGIN = "https://ga-project.github.io";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** 公開サイトのルート URL（末尾スラッシュ付き。trailingSlash: true の出力に合わせる）。 */
export const SITE_URL = `${ORIGIN}${BASE_PATH}/`;
