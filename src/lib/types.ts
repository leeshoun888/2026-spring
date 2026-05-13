export type SourceType = "naver_blog" | "naver_news" | "naver_cafe" | "youtube" | "smartstore_review";
export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "low" | "medium" | "high";
export type BusinessImpact = "low" | "medium" | "high";

export type Settings = {
  naverClientId?: string;
  naverClientSecret?: string;
  youtubeApiKey?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  cronSecret?: string;
};

export type QueryConfig = {
  productName: string;
  competitorKeywords: string[];
  analysisMode?: "ultra" | "llm";
  naverPerKeyword: number;
  youtubeVideosPerKeyword: number;
  youtubeCommentsPerVideo: number;
  maxRawItems: number;
  targetVocCount: number;
};

export type RawItem = {
  id: string;
  runId?: string;
  source: SourceType;
  sourceName: string;
  query: string;
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt?: string;
  collectedAt: string;
};

export type VocRecord = {
  id: string;
  runId: string;
  rawItemId: string;
  source: SourceType;
  sourceName: string;
  url: string;
  date: string;
  title: string;
  quote: string;
  sentiment: Sentiment;
  category: string;
  categorySecondary: string;
  keywords: string[];
  summary: string;
  insight: string;
  severity: Severity;
  businessImpact: BusinessImpact;
  relevanceScore: number;
  isProductRelevant: boolean;
  isFirstPersonReview: boolean;
  isVoc: boolean;
  evidence: string;
  recommendedAction: string;
  createdAt: string;
};

export type InsightItem = {
  title: string;
  desc: string;
  ids: string[];
  severity?: Severity;
  urgency?: Severity;
  count: number;
};

export type AnalysisRun = {
  id: string;
  productName: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  rawCount: number;
  vocCount: number;
  error?: string;
  deletedAt?: string;
  purgeAt?: string;
};

export type DashboardData = {
  metadata: {
    productName: string;
    collectedAt?: string;
    totalVocCount: number;
    sourceBreakdown: Record<SourceType, number>;
    rawSourceBreakdown: Record<SourceType, number>;
    latestRun?: AnalysisRun;
    selectedRunId?: string;
    runs: AnalysisRun[];
    trashedRuns: AnalysisRun[];
  };
  aggregation: {
    sentiment: Record<Sentiment, number>;
    sentimentPct: Record<Sentiment, number>;
    quality: {
      firstPersonReviewCount: number;
      productRelevantCount: number;
      highRiskCount: number;
      averageRelevanceScore: number;
    };
    category: Record<string, number>;
    negativeReasons: Record<string, number>;
    keywords: { kw: string; count: number; sent: Sentiment }[];
    trend: { label: string; positive: number; neutral: number; negative: number }[];
  };
  insights: {
    pain: InsightItem[];
    strength: InsightItem[];
    opportunity: InsightItem[];
    risk: InsightItem[];
  };
  vocRecords: VocRecord[];
  rawItems: RawItem[];
};
