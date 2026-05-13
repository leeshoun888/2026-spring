import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisRun, DashboardData, RawItem, Settings, SourceType, VocRecord } from "./types";

type StoreShape = {
  settings: Settings;
  runs: AnalysisRun[];
  rawItems: RawItem[];
  vocRecords: VocRecord[];
};

type AnalysisStoreShape = Omit<StoreShape, "settings">;

const PRIVATE_DATA_DIR = path.join(process.cwd(), ".data");
const REPO_DATA_DIR = path.join(process.cwd(), "data");
const ANALYSIS_STORE_FILE = path.join(REPO_DATA_DIR, "voc-state.json");
const PRIVATE_SETTINGS_FILE = path.join(PRIVATE_DATA_DIR, "settings.json");
const LEGACY_STORE_FILE = path.join(PRIVATE_DATA_DIR, "voc-state.json");
const MAX_STORED_ITEMS = 100000;
const MAX_RESPONSE_ITEMS = 10000;
const TRASH_RETENTION_DAYS = 90;

const EMPTY_STORE: StoreShape = {
  settings: {},
  runs: [],
  rawItems: [],
  vocRecords: []
};

const EMPTY_ANALYSIS_STORE: AnalysisStoreShape = {
  runs: [],
  rawItems: [],
  vocRecords: []
};

async function ensureStore() {
  await Promise.all([mkdir(PRIVATE_DATA_DIR, { recursive: true }), mkdir(REPO_DATA_DIR, { recursive: true })]);
}

export async function readStore(): Promise<StoreShape> {
  await ensureStore();
  const [analysis, settings] = await Promise.all([readAnalysisStore(), readSettingsStore()]);
  return { ...analysis, settings };
}

export async function writeStore(store: StoreShape) {
  await ensureStore();
  await Promise.all([writeAnalysisStore(store), writeSettingsStore(store.settings)]);
}

export function withEnvSettings(settings: Settings): Settings {
  return {
    naverClientId: process.env.NAVER_CLIENT_ID || settings.naverClientId,
    naverClientSecret: process.env.NAVER_CLIENT_SECRET || settings.naverClientSecret,
    youtubeApiKey: process.env.YOUTUBE_API_KEY || settings.youtubeApiKey,
    openaiApiKey: process.env.OPENAI_API_KEY || settings.openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL || settings.openaiModel || "gpt-4o-mini",
    cronSecret: process.env.CRON_SECRET || settings.cronSecret
  };
}

export async function getSettings(): Promise<Settings> {
  const store = await readStore();
  return withEnvSettings(store.settings);
}

export async function saveSettings(settings: Settings) {
  const current = await readSettingsStore();
  const cleaned = removeEmptySecrets(settings);
  await writeSettingsStore({
    ...current,
    ...cleaned,
    openaiModel: cleaned.openaiModel || current.openaiModel || "gpt-4o-mini"
  });
}

export async function addRun(run: AnalysisRun) {
  const store = await readStore();
  store.runs = [run, ...store.runs];
  await writeStore(store);
}

export async function updateRun(id: string, patch: Partial<AnalysisRun>) {
  const store = await readStore();
  store.runs = store.runs.map((run) => (run.id === id ? { ...run, ...patch } : run));
  await writeStore(store);
}

export async function moveRunToTrash(id: string) {
  const store = await readStore();
  const deletedAt = new Date().toISOString();
  const purgeAt = addDays(deletedAt, TRASH_RETENTION_DAYS);
  store.runs = store.runs.map((run) => (run.id === id ? { ...run, deletedAt, purgeAt } : run));
  await writeStore(store);
}

export async function restoreRun(id: string) {
  const store = await readStore();
  store.runs = store.runs.map((run) => {
    if (run.id !== id) return run;
    const { deletedAt, purgeAt, ...restoredRun } = run;
    return restoredRun;
  });
  await writeStore(store);
}

export async function appendData(runId: string, rawItems: RawItem[], vocRecords: VocRecord[]) {
  const store = await readStore();
  const rawById = new Map(store.rawItems.map((item) => [projectKey(item.runId, item.id), item]));
  const vocByRaw = new Map(store.vocRecords.map((record) => [projectKey(record.runId, record.rawItemId), record]));
  rawItems.forEach((item) => rawById.set(projectKey(runId, item.id), { ...item, runId }));
  vocRecords.forEach((record) => vocByRaw.set(projectKey(runId, record.rawItemId), { ...record, runId }));
  store.rawItems = Array.from(rawById.values()).sort(sortByDateDesc).slice(0, MAX_STORED_ITEMS);
  store.vocRecords = Array.from(vocByRaw.values()).sort(sortByRecordDateDesc).slice(0, MAX_STORED_ITEMS);
  await writeStore(store);
}

export async function buildDashboardData(runId?: string): Promise<DashboardData> {
  const store = await readStore();
  const activeRuns = store.runs.filter((run) => !run.deletedAt);
  const trashedRuns = store.runs.filter((run) => run.deletedAt);
  const latestRun = activeRuns[0];
  const selectedRun = activeRuns.find((run) => run.id === runId) || latestRun;
  const selectedRunId = selectedRun?.id;
  const records = store.vocRecords.filter((record) => !selectedRunId || record.runId === selectedRunId);
  const rawItems = store.rawItems.filter((item) => !selectedRunId || item.runId === selectedRunId);
  const productName = selectedRun?.productName || "매일 바이오 그릭요거트";

  const sourceBreakdown = countBy(records, (record) => record.source) as Record<SourceType, number>;
  const rawSourceBreakdown = countBy(rawItems, (item) => item.source) as Record<SourceType, number>;
  const sentiment = {
    positive: records.filter((r) => r.sentiment === "positive").length,
    neutral: records.filter((r) => r.sentiment === "neutral").length,
    negative: records.filter((r) => r.sentiment === "negative").length
  };
  const total = records.length || 1;
  const sentimentPct = {
    positive: round1((sentiment.positive / total) * 100),
    neutral: round1((sentiment.neutral / total) * 100),
    negative: round1((sentiment.negative / total) * 100)
  };
  const quality = {
    firstPersonReviewCount: records.filter((record) => record.isFirstPersonReview).length,
    productRelevantCount: records.filter((record) => record.isProductRelevant !== false).length,
    highRiskCount: records.filter((record) => record.severity === "high" || record.businessImpact === "high").length,
    averageRelevanceScore: round1((records.reduce((sum, record) => sum + (record.relevanceScore || 0), 0) / total) * 100)
  };

  const category = countBy(records, (record) => record.category || "기타");
  const negativeReasons = countBy(
    records.filter((record) => record.sentiment === "negative"),
    (record) => record.categorySecondary || record.category || "기타"
  );
  const keywordMap = new Map<string, { count: number; sentiments: Record<string, number> }>();
  records.forEach((record) => {
    record.keywords.forEach((kw) => {
      const current = keywordMap.get(kw) || { count: 0, sentiments: {} };
      current.count += 1;
      current.sentiments[record.sentiment] = (current.sentiments[record.sentiment] || 0) + 1;
      keywordMap.set(kw, current);
    });
  });
  const keywords = Array.from(keywordMap.entries())
    .map(([kw, item]) => ({
      kw,
      count: item.count,
      sent: dominantSentiment(item.sentiments)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  return {
    metadata: {
      productName,
      collectedAt: records[0]?.createdAt || rawItems[0]?.collectedAt,
      totalVocCount: records.length,
      sourceBreakdown: {
        naver_blog: sourceBreakdown.naver_blog || 0,
        naver_news: sourceBreakdown.naver_news || 0,
        naver_cafe: sourceBreakdown.naver_cafe || 0,
        youtube: sourceBreakdown.youtube || 0,
        smartstore_review: sourceBreakdown.smartstore_review || 0
      },
      rawSourceBreakdown: {
        naver_blog: rawSourceBreakdown.naver_blog || 0,
        naver_news: rawSourceBreakdown.naver_news || 0,
        naver_cafe: rawSourceBreakdown.naver_cafe || 0,
        youtube: rawSourceBreakdown.youtube || 0,
        smartstore_review: rawSourceBreakdown.smartstore_review || 0
      },
      latestRun: selectedRun,
      selectedRunId,
      runs: activeRuns,
      trashedRuns
    },
    aggregation: {
      sentiment,
      sentimentPct,
      quality,
      category,
      negativeReasons,
      keywords,
      trend: buildTrend(records)
    },
    insights: buildInsights(records),
    vocRecords: records.slice(0, MAX_RESPONSE_ITEMS),
    rawItems: rawItems.slice(0, MAX_RESPONSE_ITEMS)
  };
}

function countBy<T>(items: T[], pick: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = pick(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildTrend(records: VocRecord[]) {
  const days = [...Array(14)].map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    return date.toISOString().slice(0, 10);
  });
  return days.map((day) => {
    const daily = records.filter((record) => (record.date || record.createdAt).slice(0, 10) === day);
    return {
      label: day.slice(5),
      positive: daily.filter((r) => r.sentiment === "positive").length,
      neutral: daily.filter((r) => r.sentiment === "neutral").length,
      negative: daily.filter((r) => r.sentiment === "negative").length
    };
  });
}

function buildInsights(records: VocRecord[]) {
  const negative = records.filter((record) => record.sentiment === "negative");
  const positive = records.filter((record) => record.sentiment === "positive");
  const byNegativeCategory = groupBy(negative, (record) => record.categorySecondary || record.category);
  const byPositiveCategory = groupBy(positive, (record) => record.categorySecondary || record.category);
  const highRisk = negative.filter((record) => record.severity === "high");

  return {
    pain: toInsightItems(byNegativeCategory, "불만", true),
    strength: toInsightItems(byPositiveCategory, "강점", false),
    opportunity: toOpportunityItems(positive),
    risk: toInsightItems(groupBy(highRisk.length ? highRisk : negative, (record) => record.categorySecondary || record.category), "리스크", true)
  };
}

function groupBy<T>(items: T[], pick: (item: T) => string) {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = pick(item) || "기타";
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return groups;
}

function toInsightItems(groups: Map<string, VocRecord[]>, suffix: string, includeSeverity: boolean) {
  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([key, items]) => {
      const representative = items[0];
      return {
        title: `${key} ${suffix}`,
        desc: representative?.insight || representative?.summary || `${key} 관련 발화가 반복적으로 확인됩니다.`,
        ids: items.slice(0, 3).map((item) => item.id),
        severity: includeSeverity ? representative?.severity : undefined,
        urgency: includeSeverity ? representative?.severity : undefined,
        count: items.length
      };
    });
}

function toOpportunityItems(records: VocRecord[]) {
  const keywordGroups = groupBy(
    records.filter((record) => record.keywords.length),
    (record) => record.keywords[0]
  );
  return toInsightItems(keywordGroups, "활용 기회", false);
}

function dominantSentiment(sentiments: Record<string, number>) {
  const [sentiment] = Object.entries(sentiments).sort((a, b) => b[1] - a[1])[0] || ["neutral"];
  return sentiment as "positive" | "neutral" | "negative";
}

function sortByDateDesc(a: RawItem, b: RawItem) {
  return (b.publishedAt || b.collectedAt).localeCompare(a.publishedAt || a.collectedAt);
}

function sortByRecordDateDesc(a: VocRecord, b: VocRecord) {
  return (b.date || b.createdAt).localeCompare(a.date || a.createdAt);
}

function projectKey(runId: string | undefined, id: string) {
  return `${runId || "run-unknown"}:${id}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function removeEmptySecrets(settings: Settings) {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => {
      if (typeof value !== "string") return true;
      if (!value.trim()) return false;
      if (value.includes("••••")) return false;
      return true;
    })
  ) as Settings;
}

async function readAnalysisStore(): Promise<AnalysisStoreShape> {
  const analysis = await readJson<Partial<AnalysisStoreShape>>(ANALYSIS_STORE_FILE);
  if (analysis) {
    const normalized = purgeExpiredRuns(normalizeAnalysisStore(analysis));
    if (hasAnalysisData(normalized)) {
      if (hasOrphanAnalysisData(analysis) || hasExpiredTrashedRuns(analysis)) await writeAnalysisStore(normalized);
      return normalized;
    }
  }

  const legacy = await readJson<Partial<StoreShape>>(LEGACY_STORE_FILE);
  const migrated = purgeExpiredRuns(normalizeAnalysisStore(legacy || EMPTY_ANALYSIS_STORE));
  if (hasAnalysisData(migrated)) {
    await writeAnalysisStore(migrated);
    return migrated;
  }

  await writeAnalysisStore(EMPTY_ANALYSIS_STORE);
  return structuredClone(EMPTY_ANALYSIS_STORE);
}

async function readSettingsStore(): Promise<Settings> {
  const settings = await readJson<Settings>(PRIVATE_SETTINGS_FILE);
  if (settings && hasAnySecret(settings)) return settings;

  const legacy = await readJson<Partial<StoreShape>>(LEGACY_STORE_FILE);
  if (legacy?.settings) {
    const migrated = { ...legacy.settings, ...removeEmptySecrets(settings || {}) };
    await writeSettingsStore(migrated);
    return migrated;
  }

  if (settings) return settings;
  await writeSettingsStore({});
  return {};
}

async function writeAnalysisStore(store: Partial<AnalysisStoreShape>) {
  await mkdir(REPO_DATA_DIR, { recursive: true });
  const analysis: AnalysisStoreShape = purgeExpiredRuns(normalizeAnalysisStore(store));
  await writeFile(ANALYSIS_STORE_FILE, JSON.stringify(analysis, null, 2));
}

async function writeSettingsStore(settings: Settings) {
  await mkdir(PRIVATE_DATA_DIR, { recursive: true });
  await writeFile(PRIVATE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeAnalysisStore(store: Partial<AnalysisStoreShape> | Partial<StoreShape>): AnalysisStoreShape {
  const runs = Array.isArray(store.runs) ? store.runs : [];
  const fallbackRunId = runs[0]?.id || "run-legacy-import";
  const hasOrphanData =
    (Array.isArray(store.rawItems) && store.rawItems.some((item) => !item.runId)) ||
    (Array.isArray(store.vocRecords) && store.vocRecords.some((record) => !record.runId));
  const normalizedRuns =
    runs.length || !hasOrphanData
      ? runs
      : [
          {
            id: fallbackRunId,
            productName: "가져온 기존 분석",
            status: "completed" as const,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            rawCount: Array.isArray(store.rawItems) ? store.rawItems.length : 0,
            vocCount: Array.isArray(store.vocRecords) ? store.vocRecords.length : 0
          }
        ];
  const selectedFallbackRunId = normalizedRuns[0]?.id || fallbackRunId;

  return {
    runs: normalizedRuns,
    rawItems: Array.isArray(store.rawItems) ? store.rawItems.map((item) => ({ ...item, runId: item.runId || selectedFallbackRunId })) : [],
    vocRecords: Array.isArray(store.vocRecords)
      ? store.vocRecords.map((record) => ({ ...record, runId: record.runId || selectedFallbackRunId }))
      : []
  };
}

function hasAnalysisData(store: AnalysisStoreShape) {
  return store.runs.length > 0 || store.rawItems.length > 0 || store.vocRecords.length > 0;
}

function hasOrphanAnalysisData(store: Partial<AnalysisStoreShape>) {
  return Boolean(
    store.rawItems?.some((item) => !item.runId) ||
      store.vocRecords?.some((record) => !record.runId)
  );
}

function purgeExpiredRuns(store: AnalysisStoreShape): AnalysisStoreShape {
  const now = Date.now();
  const expiredIds = new Set(
    store.runs
      .filter((run) => run.deletedAt && run.purgeAt && new Date(run.purgeAt).getTime() <= now)
      .map((run) => run.id)
  );
  if (!expiredIds.size) return store;
  return {
    runs: store.runs.filter((run) => !expiredIds.has(run.id)),
    rawItems: store.rawItems.filter((item) => !expiredIds.has(item.runId || "")),
    vocRecords: store.vocRecords.filter((record) => !expiredIds.has(record.runId))
  };
}

function hasExpiredTrashedRuns(store: Partial<AnalysisStoreShape>) {
  const now = Date.now();
  return Boolean(store.runs?.some((run) => run.deletedAt && run.purgeAt && new Date(run.purgeAt).getTime() <= now));
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function hasAnySecret(settings: Settings) {
  return Boolean(settings.naverClientId || settings.naverClientSecret || settings.youtubeApiKey || settings.openaiApiKey || settings.cronSecret);
}
