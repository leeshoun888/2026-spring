import type { RawItem, Settings, SourceType } from "./types";
import { clampText, stableId, stripHtml, toIsoDate } from "./utils";

type NaverItem = {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  cafename?: string;
  postdate?: string;
  pubDate?: string;
};

const ENDPOINTS: { source: SourceType; label: string; path: string }[] = [
  { source: "naver_blog", label: "네이버 블로그", path: "blog" },
  { source: "naver_cafe", label: "네이버 카페글", path: "cafearticle" },
  { source: "naver_news", label: "네이버 뉴스", path: "news" }
];

export async function collectNaver(settings: Settings, keywords: string[], perKeyword: number): Promise<RawItem[]> {
  if (!settings.naverClientId || !settings.naverClientSecret) return [];
  const totalLimit = Math.min(Math.max(perKeyword, 1), 1000);
  const collected: RawItem[] = [];

  for (const keyword of keywords) {
    for (const endpoint of ENDPOINTS) {
      for (let start = 1; start <= totalLimit; start += 100) {
        const display = Math.min(100, totalLimit - start + 1);
        const url = new URL(`https://openapi.naver.com/v1/search/${endpoint.path}.json`);
        url.searchParams.set("query", keyword);
        url.searchParams.set("display", String(display));
        url.searchParams.set("start", String(start));
        url.searchParams.set("sort", "date");

        const response = await fetch(url, {
          headers: {
            "X-Naver-Client-Id": settings.naverClientId,
            "X-Naver-Client-Secret": settings.naverClientSecret
          },
          next: { revalidate: 0 }
        });
        if (!response.ok) {
          throw new Error(`Naver ${endpoint.path} API failed: ${response.status} ${await response.text()}`);
        }
        const data = (await response.json()) as { items?: NaverItem[] };
        const items = data.items || [];
        if (!items.length) break;
        for (const item of items) {
          const title = stripHtml(item.title || "");
          const content = stripHtml(item.description || "");
          const link = item.link || "";
          if (!link || (!title && !content)) continue;
          collected.push({
            id: stableId("raw", `${endpoint.source}:${link}:${content}`),
            source: endpoint.source,
            sourceName: endpoint.label,
            query: keyword,
            title: clampText(title, 240),
            content: clampText(content, 1200),
            url: link,
            author: item.bloggername || item.cafename,
            publishedAt: toIsoDate(item.postdate || item.pubDate),
            collectedAt: new Date().toISOString()
          });
        }
        if (items.length < display) break;
      }
    }
  }

  return collected;
}

export async function testNaver(settings: Settings) {
  if (!settings.naverClientId || !settings.naverClientSecret) {
    return { ok: false, message: "네이버 Client ID/Secret이 필요합니다." };
  }
  try {
    const items = await collectNaver(settings, ["매일유업"], 1);
    return { ok: true, message: `네이버 검색 API 연결 성공 (${items.length}건 테스트 수집)` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "네이버 연결 실패" };
  }
}
