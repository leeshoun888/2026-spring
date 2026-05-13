import type { RawItem, Settings } from "./types";
import { clampText, stableId, stripHtml, toIsoDate } from "./utils";

type SearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
};

type CommentThread = {
  id: string;
  snippet?: {
    topLevelComment?: {
      snippet?: {
        textDisplay?: string;
        textOriginal?: string;
        authorDisplayName?: string;
        publishedAt?: string;
      };
    };
    videoId?: string;
  };
};

export async function collectYoutube(
  settings: Settings,
  keywords: string[],
  videosPerKeyword: number,
  commentsPerVideo: number
): Promise<RawItem[]> {
  if (!settings.youtubeApiKey) return [];
  const rawItems: RawItem[] = [];
  const videoIds = new Map<string, SearchItem>();

  for (const keyword of keywords) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("q", keyword);
    url.searchParams.set("maxResults", String(Math.min(Math.max(videosPerKeyword, 1), 25)));
    url.searchParams.set("order", "date");
    url.searchParams.set("key", settings.youtubeApiKey);

    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      throw new Error(`YouTube search API failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { items?: SearchItem[] };
    for (const item of data.items || []) {
      const videoId = item.id?.videoId;
      if (videoId) videoIds.set(videoId, item);
    }
  }

  for (const [videoId, video] of videoIds) {
    const videoTitle = stripHtml(video.snippet?.title || "YouTube video");
    const videoDescription = stripHtml(video.snippet?.description || videoTitle);
    rawItems.push({
      id: stableId("raw", `youtube-video:${videoId}:${videoDescription}`),
      source: "youtube",
      sourceName: "YouTube 영상",
      query: videoTitle,
      title: clampText(videoTitle, 240),
      content: clampText(videoDescription, 1200),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      author: video.snippet?.channelTitle,
      publishedAt: toIsoDate(video.snippet?.publishedAt),
      collectedAt: new Date().toISOString()
    });

    const commentsUrl = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    commentsUrl.searchParams.set("part", "snippet");
    commentsUrl.searchParams.set("videoId", videoId);
    commentsUrl.searchParams.set("textFormat", "plainText");
    commentsUrl.searchParams.set("maxResults", String(Math.min(Math.max(commentsPerVideo, 1), 100)));
    commentsUrl.searchParams.set("order", "time");
    commentsUrl.searchParams.set("key", settings.youtubeApiKey || "");

    const response = await fetch(commentsUrl, { next: { revalidate: 0 } });
    if (!response.ok) continue;
    const data = (await response.json()) as { items?: CommentThread[] };
    for (const thread of data.items || []) {
      const snippet = thread.snippet?.topLevelComment?.snippet;
      const text = stripHtml(snippet?.textOriginal || snippet?.textDisplay || "");
      if (!text) continue;
      rawItems.push({
        id: stableId("raw", `youtube:${thread.id}:${text}`),
        source: "youtube",
        sourceName: "YouTube 댓글",
        query: videoTitle,
        title: clampText(videoTitle, 240),
        content: clampText(text, 1200),
        url: `https://www.youtube.com/watch?v=${videoId}&lc=${thread.id}`,
        author: snippet?.authorDisplayName,
        publishedAt: toIsoDate(snippet?.publishedAt || video.snippet?.publishedAt),
        collectedAt: new Date().toISOString()
      });
    }
  }

  return rawItems;
}

export async function testYoutube(settings: Settings) {
  if (!settings.youtubeApiKey) {
    return { ok: false, message: "YouTube API Key가 필요합니다." };
  }
  try {
    const items = await collectYoutube(settings, ["매일유업"], 1, 1);
    return { ok: true, message: `YouTube Data API 연결 성공 (${items.length}건 테스트 수집)` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "YouTube 연결 실패" };
  }
}
