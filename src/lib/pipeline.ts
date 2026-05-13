import { analyzeRawItemsLocally, analyzeRawItemsToTarget } from "./analyzer";
import { isLikelyRelevantCandidate, isStrictValidVoc } from "./gates";
import { generateSearchKeywords } from "./keywords";
import { collectNaver } from "./naver";
import { addRun, appendData, getSettings, updateRun } from "./store";
import type { AnalysisRun, QueryConfig, RawItem } from "./types";
import { collectYoutube } from "./youtube";

const DEFAULT_TARGET_VOC_COUNT = 10000;
const DEFAULT_RAW_POOL_LIMIT = 10000;
const MAX_ANALYSIS_ITEMS = 10000;
const SOURCE_ORDER = ["naver_blog", "naver_cafe", "naver_news", "youtube"] as const;

export async function runAnalysis(config: Partial<QueryConfig> = {}) {
  const settings = await getSettings();
  const productName = config.productName || "매일 바이오 그릭요거트";
  const analysisMode = config.analysisMode || "ultra";
  const keywords = normalizeKeywords(config.keywords?.length ? config.keywords : defaultKeywords(productName, analysisMode));
  const targetVocCount = Math.min(Math.max(config.targetVocCount || DEFAULT_TARGET_VOC_COUNT, 1), MAX_ANALYSIS_ITEMS);
  const rawPoolLimit = Math.min(Math.max(config.maxRawItems || DEFAULT_RAW_POOL_LIMIT, targetVocCount), MAX_ANALYSIS_ITEMS);
  const run: AnalysisRun = {
    id: `run-${Date.now()}`,
    productName,
    status: "running",
    startedAt: new Date().toISOString(),
    rawCount: 0,
    vocCount: 0
  };
  await addRun(run);

  try {
    const [naverItems, youtubeItems] = await Promise.all([
      collectNaver(settings, keywords, config.naverPerKeyword || 1000),
      collectYoutube(settings, keywords, config.youtubeVideosPerKeyword || 25, config.youtubeCommentsPerVideo || 80)
    ]);
    const rawItems = takeBalancedRawItems(dedupeRawItems([...naverItems, ...youtubeItems]), rawPoolLimit)
      .map((item) => ({ ...item, runId: run.id }));
    const candidateItems = rawItems.filter((item) => isLikelyRelevantCandidate(item, productName));
    const vocRecords =
      analysisMode === "llm"
        ? (
            await analyzeRawItemsToTarget(
              settings,
              productName,
              candidateItems,
              targetVocCount,
              isStrictValidVoc
            )
          ).records
        : analyzeRawItemsLocally(productName, rawItems).slice(0, targetVocCount);
    await appendData(run.id, rawItems, vocRecords);
    await updateRun(run.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      rawCount: rawItems.length,
      vocCount: vocRecords.length
    });
    return {
      ...run,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      rawCount: rawItems.length,
      vocCount: vocRecords.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis failure";
    await updateRun(run.id, { status: "failed", completedAt: new Date().toISOString(), error: message });
    throw error;
  }
}

function normalizeKeywords(keywords: string[]) {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 20);
}

function defaultKeywords(productName: string, analysisMode: QueryConfig["analysisMode"]) {
  return analysisMode === "ultra" ? generateSearchKeywords(productName) : [productName];
}

function takeBalancedRawItems(items: RawItem[], limit: number) {
  const groups = new Map<RawItem["source"], RawItem[]>();
  items.forEach((item) => {
    groups.set(item.source, [...(groups.get(item.source) || []), item]);
  });

  const offsets = new Map<RawItem["source"], number>();
  const selected: RawItem[] = [];
  while (selected.length < limit) {
    let pickedThisRound = 0;
    for (const source of SOURCE_ORDER) {
      const group = groups.get(source) || [];
      const offset = offsets.get(source) || 0;
      if (offset >= group.length) continue;
      selected.push(group[offset]);
      offsets.set(source, offset + 1);
      pickedThisRound += 1;
      if (selected.length >= limit) break;
    }
    if (!pickedThisRound) break;
  }
  return selected;
}

function dedupeRawItems(items: RawItem[]) {
  const map = new Map<string, RawItem>();
  items.forEach((item) => {
    const key = item.url || item.id;
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values());
}
