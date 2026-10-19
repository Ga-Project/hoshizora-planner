import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// static export では out/robots.txt として書き出される。
// 注意: プロジェクトページ配信では出力先が /<slug>/robots.txt になり、クローラが読むのは
// origin 直下の /robots.txt だけ。sitemap の自動発見は効かないので Search Console から直接送信する。
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}sitemap.xml`,
  };
}
