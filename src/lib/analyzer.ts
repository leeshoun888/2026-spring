import type { BusinessImpact, RawItem, Settings, Severity, Sentiment, VocRecord } from "./types";
import { productRelevanceScore } from "./gates";
import { stableId } from "./utils";

const ANALYSIS_BATCH_SIZE = 10;
const LLM_TITLE_CHAR_LIMIT = 180;
const LLM_CONTENT_CHAR_LIMIT = 700;
const LLM_MAX_OUTPUT_TOKENS = 6000;

type LlmRecord = {
  rawItemId: string;
  isVoc: boolean;
  relevanceScore: number;
  sentiment: Sentiment;
  category: string;
  categorySecondary: string;
  keywords: string[];
  summary: string;
  insight: string;
  severity: Severity;
  businessImpact: BusinessImpact;
  isProductRelevant: boolean;
  isFirstPersonReview: boolean;
  evidence: string;
  recommendedAction: string;
};

type TargetedAnalysisResult = {
  records: VocRecord[];
  analyzedRawItems: RawItem[];
};

const VOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rawItemId: { type: "string" },
          isVoc: { type: "boolean" },
          relevanceScore: { type: "number" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          category: { type: "string" },
          categorySecondary: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          insight: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          businessImpact: { type: "string", enum: ["low", "medium", "high"] },
          isProductRelevant: { type: "boolean" },
          isFirstPersonReview: { type: "boolean" },
          evidence: { type: "string" },
          recommendedAction: { type: "string" }
        },
        required: [
          "rawItemId",
          "isVoc",
          "relevanceScore",
          "sentiment",
          "category",
          "categorySecondary",
          "keywords",
          "summary",
          "insight",
          "severity",
          "businessImpact",
          "isProductRelevant",
          "isFirstPersonReview",
          "evidence",
          "recommendedAction"
        ]
      }
    }
  },
  required: ["records"]
};

export async function analyzeRawItems(settings: Settings, productName: string, rawItems: RawItem[]): Promise<VocRecord[]> {
  const batches = chunk(rawItems, ANALYSIS_BATCH_SIZE);
  const records: VocRecord[] = [];
  for (const batch of batches) {
    const analyzed = settings.openaiApiKey
      ? await analyzeWithOpenAI(settings, productName, batch)
      : heuristicAnalyze(productName, batch);
    records.push(...toVocRecords(batch, analyzed));
  }
  return records;
}

export function analyzeRawItemsLocally(productName: string, rawItems: RawItem[]): VocRecord[] {
  return toVocRecords(rawItems, heuristicAnalyze(productName, rawItems));
}

export async function analyzeRawItemsToTarget(
  settings: Settings,
  productName: string,
  rawItems: RawItem[],
  targetVocCount: number,
  isValidRecord: (record: VocRecord) => boolean
): Promise<TargetedAnalysisResult> {
  const batches = chunk(rawItems, ANALYSIS_BATCH_SIZE);
  const records: VocRecord[] = [];
  const analyzedRawItems: RawItem[] = [];

  for (const batch of batches) {
    const analyzed = settings.openaiApiKey
      ? await analyzeWithOpenAI(settings, productName, batch)
      : heuristicAnalyze(productName, batch);
    const batchRecords = toVocRecords(batch, analyzed).filter(isValidRecord);
    analyzedRawItems.push(...batch);
    records.push(...batchRecords);
    if (records.length >= targetVocCount) break;
  }

  return {
    records: records.slice(0, targetVocCount),
    analyzedRawItems
  };
}

async function analyzeWithOpenAI(settings: Settings, productName: string, rawItems: RawItem[]): Promise<LlmRecord[]> {
  const model = settings.openaiModel || "gpt-4o-mini";
  const useGpt5Controls = model.startsWith("gpt-5");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_output_tokens: LLM_MAX_OUTPUT_TOKENS,
      ...(useGpt5Controls ? { reasoning: { effort: "minimal" } } : {}),
      input: [
        {
          role: "system",
          content:
            "You are a Korean VOC analyst for Maeil Dairies. Classify public Korean posts/comments into reliable VOC records. Return only schema-valid JSON. Keep every text field concise."
        },
        {
          role: "user",
          content: JSON.stringify({
            productName,
            rules: [
              "VOC means customer experience, review, complaint, question, purchase experience, usage context, or product comparison.",
              "Be strict: mark isProductRelevant=true only when the text directly discusses the exact target product or a very explicit product-line variant. Generic Maeil, random dairy, stock, event, recipe, hiring, or unrelated health content is not relevant.",
              "If only the video title/search query mentions the product but the comment itself is generic and could apply to any product, mark isVoc=false.",
              "Mark isFirstPersonReview=true only when the text is a customer's direct experience, e.g. bought, ate, drank, used, liked, disappointed, my child/family tried. Generic informational text is false.",
              "Mark isVoc=true only when both product relevance and meaningful customer voice are present.",
              "News/press/brand-owned content can be marked isVoc=false unless it contains customer voice.",
              "Use Korean for summary and insight.",
              "Keep summary, insight, evidence, and recommendedAction under 80 Korean characters each.",
              "Categories should be short Korean labels: 맛·식감, 가격·용량, 품질, 패키징, 건강·영양, 구매·유통, 브랜드, 기타.",
              "Evidence must briefly explain why the text is a first-person review or why it was excluded.",
              "RecommendedAction must be a concrete action for Maeil Dairies product, CX, brand, sales, or quality teams."
            ],
            rawItems: rawItems.map((item) => ({
              rawItemId: item.id,
              source: item.source,
              title: compactForLlm(item.title, LLM_TITLE_CHAR_LIMIT),
              content: compactForLlm(item.content, LLM_CONTENT_CHAR_LIMIT),
              url: item.url
            }))
          })
        }
      ],
      text: {
        ...(useGpt5Controls ? { verbosity: "low" } : {}),
        format: {
          type: "json_schema",
          name: "voc_batch_analysis",
          strict: true,
          schema: VOC_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI analysis failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) {
    const reason = data.incomplete_details?.reason || data.status || "unknown";
    throw new Error(`OpenAI returned empty analysis output. reason=${reason}, model=${model}, batch=${rawItems.length}`);
  }
  return JSON.parse(outputText).records as LlmRecord[];
}

function extractOutputText(data: {
  output_text?: string;
  output?: { content?: { text?: string; type?: string }[] }[];
}) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  return "";
}

function heuristicAnalyze(productName: string, rawItems: RawItem[]): LlmRecord[] {
  const negativeWords = ["비싸", "불편", "문제", "별로", "아쉽", "누수", "유청", "상했", "짧", "부담", "냄새", "환불"];
  const positiveWords = ["좋", "맛있", "만족", "추천", "편하", "신뢰", "꾸덕", "단백질", "재구매", "깔끔"];

  return rawItems.map((item) => {
    const text = `${item.title} ${item.content}`;
    const neg = negativeWords.filter((word) => text.includes(word)).length;
    const pos = positiveWords.filter((word) => text.includes(word)).length;
    const sentiment: Sentiment = neg > pos ? "negative" : pos > neg ? "positive" : "neutral";
    const category = pickCategory(text);
    const keywords = extractKeywords(text, productName);
    const severity: Severity = sentiment === "negative" && neg >= 2 ? "high" : sentiment === "negative" ? "medium" : "low";
    const relevanceScore = productRelevanceScore(text, productName);
    const isProductRelevant = relevanceScore >= 0.72;
    const isFirstPersonReview = isLikelyFirstPersonReview(text);
    const isVoc = isProductRelevant && (isFirstPersonReview || /후기|리뷰|추천|불만|재구매|먹어|마셔|샀|맛있|만족|별로|비싸/.test(text));
    return {
      rawItemId: item.id,
      isVoc,
      relevanceScore,
      sentiment,
      category,
      categorySecondary: keywords[0] || category,
      keywords,
      summary: `${category} 관련 ${sentimentLabel(sentiment)} 발화`,
      insight:
        sentiment === "negative"
          ? `${category} 이슈를 우선 확인하고 반복 키워드를 모니터링해야 합니다.`
          : `${category} 강점을 제품 메시지와 채널 운영에 반영할 수 있습니다.`,
      severity,
      businessImpact: severity === "high" ? "high" : sentiment === "negative" ? "medium" : "low",
      isProductRelevant,
      isFirstPersonReview,
      evidence: isFirstPersonReview ? "직접 경험 표현이 포함된 고객 발화로 판정했습니다." : "직접 경험 표현은 약하지만 제품 관련 발화로 분류했습니다.",
      recommendedAction:
        sentiment === "negative"
          ? `${category} 관련 반복 VOC를 CS/품질/상품 담당자가 원문 근거와 함께 점검하세요.`
          : `${category} 긍정 표현을 상세페이지·캠페인 메시지 후보로 검토하세요.`
    };
  });
}

function toVocRecords(rawItems: RawItem[], analyzed: LlmRecord[]): VocRecord[] {
  const rawById = new Map(rawItems.map((item) => [item.id, item]));
  return analyzed
    .map((item, index) => {
      const raw = rawById.get(item.rawItemId);
      if (!raw) return null;
      return {
        id: stableId("VOC", `${raw.id}:${index}`),
        runId: raw.runId || "run-unknown",
        rawItemId: raw.id,
        source: raw.source,
        sourceName: raw.sourceName,
        url: raw.url,
        date: raw.publishedAt || raw.collectedAt.slice(0, 10),
        title: raw.title,
        quote: raw.content,
        sentiment: item.sentiment,
        category: item.category,
        categorySecondary: item.categorySecondary,
        keywords: item.keywords.slice(0, 6),
        summary: item.summary,
        insight: item.insight,
        severity: item.severity,
        businessImpact: item.businessImpact,
        relevanceScore: Math.max(0, Math.min(1, item.relevanceScore)),
        isProductRelevant: item.isProductRelevant,
        isFirstPersonReview: item.isFirstPersonReview,
        isVoc: item.isVoc,
        evidence: item.evidence,
        recommendedAction: item.recommendedAction,
        createdAt: new Date().toISOString()
      };
    })
    .filter(Boolean) as VocRecord[];
}

function pickCategory(text: string) {
  if (/가격|비싸|가성비|용량|단가/.test(text)) return "가격·용량";
  if (/유청|품질|유통기한|상했|변질|냄새/.test(text)) return "품질";
  if (/포장|뚜껑|용기|누수|스푼/.test(text)) return "패키징";
  if (/단백질|유산균|건강|다이어트|락토프리|무첨가/.test(text)) return "건강·영양";
  if (/구매|배송|마트|쿠팡|컬리|코스트코|매장|진열/.test(text)) return "구매·유통";
  if (/맛|식감|꾸덕|시큼|달|허니|무가당/.test(text)) return "맛·식감";
  return "기타";
}

function extractKeywords(text: string, productName: string) {
  const candidates = [
    productName,
    "매일유업",
    "그릭요거트",
    "단백질",
    "유청 분리",
    "락토프리",
    "무첨가",
    "가격",
    "가성비",
    "꾸덕꾸덕",
    "유통기한",
    "누수",
    "허니",
    "다이어트",
    "코스트코"
  ];
  const found = candidates.filter((word) => text.includes(word)).slice(0, 5);
  return found.length ? found : [pickCategory(text)];
}

function isLikelyFirstPersonReview(text: string) {
  return /제가|나는|전 |저는|우리|아이|남편|아내|엄마|아빠|먹어|마셔|샀|구매|재구매|먹였|먹어봤|마셔봤|좋았|좋아요|맛있|만족|별로|불편|추천/.test(text);
}

function sentimentLabel(sentiment: Sentiment) {
  return sentiment === "positive" ? "긍정" : sentiment === "negative" ? "부정" : "중립";
}

function compactForLlm(value: string, maxChars: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxChars ? `${compacted.slice(0, maxChars)}...` : compacted;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
