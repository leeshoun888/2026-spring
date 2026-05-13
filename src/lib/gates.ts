import type { RawItem, VocRecord } from "./types";

const GENERIC_TOKENS = new Set([
  "매일",
  "매일유업",
  "바이오",
  "제품",
  "후기",
  "리뷰",
  "추천"
]);

const REVIEW_SIGNAL = /후기|리뷰|먹어|먹었|마셔|마셨|샀|구매|재구매|추천|비추|좋아요|좋았|맛있|별로|불편|비싸|가격|배송|유통기한|환불|문의|댓글|장점|단점|만족|불만|아이|가족|운동|다이어트|식단/;
const NON_VOC_SIGNAL = /채용|공시|주가|증권|보도자료|보도|출시|밝혔다|기사|행사|이벤트|캠페인 모집|서포터즈|레시피 공모|논문|학회|입찰|인사발령/;
const MIN_STRICT_RELEVANCE = 0.72;

const MAEIL_PRODUCT_GROUPS = [
  ["셀렉스", "셀렉스프로틴", "코어프로틴", "프로틴락토프리"],
  ["매일바이오", "매일바이오그릭", "바이오그릭"],
  ["상하목장", "상하우유", "상하치즈", "상하요거트"],
  ["소화가잘되는우유", "소잘우", "락토프리우유"],
  ["바리스타룰스", "바리스타"],
  ["어메이징오트", "오트음료"],
  ["앱솔루트", "명작분유", "유기농궁"],
  ["맘마밀"],
  ["피크닉"],
  ["매일두유"],
  ["허쉬초콜릿드링크", "허쉬드링크"]
];

const COMPETITOR_TERMS = [
  "남양",
  "남양유업",
  "불가리스",
  "아이엠마더",
  "서울우유",
  "나100%",
  "빙그레",
  "요플레",
  "닥터캡슐",
  "풀무원",
  "다논",
  "액티비아",
  "그릭데이",
  "일동후디스",
  "하이뮨",
  "파스퇴르",
  "동원",
  "덴마크우유",
  "닥터유",
  "뉴케어"
].map(normalize);

const SKU_IDENTIFIER_TERMS = [
  "락토프리",
  "플러스",
  "오리지널",
  "저당",
  "무가당",
  "무지방",
  "저지방",
  "고단백",
  "초코",
  "초콜릿",
  "바나나",
  "딸기",
  "허니",
  "대용량",
  "마시는",
  "드링크",
  "파우더",
  "분말",
  "스틱"
].map(normalize);

export function isLikelyRelevantCandidate(item: RawItem, productName: string) {
  const title = `${item.title}`;
  const content = `${item.content}`;
  const text = `${title} ${content}`;
  const normalized = normalize(text);
  if (!normalized || !normalize(productName)) return false;
  if (NON_VOC_SIGNAL.test(normalized) && !hasVocSignal(content)) return false;
  if (!hasVocSignal(text)) return false;
  if (hasOtherDominantProduct(text, productName)) return false;
  return productRelevanceScore(text, productName) >= MIN_STRICT_RELEVANCE;
}

export function isStrictValidVoc(record: VocRecord, productName?: string) {
  const text = `${record.title} ${record.quote}`;
  const hasTargetSignal = productName ? productRelevanceScore(text, productName) >= MIN_STRICT_RELEVANCE : true;
  const hasNoDominantOtherProduct = productName ? !hasOtherDominantProduct(text, productName) : true;
  return (
    record.isVoc &&
    record.isProductRelevant &&
    record.relevanceScore >= MIN_STRICT_RELEVANCE &&
    hasTargetSignal &&
    hasNoDominantOtherProduct &&
    (record.isFirstPersonReview || hasStrongReviewSignal(`${record.title} ${record.quote}`))
  );
}

export function productRelevanceScore(text: string, productName: string) {
  const normalizedText = normalize(text);
  const normalizedProduct = normalize(productName);
  if (!normalizedText || !normalizedProduct) return 0;
  if (normalizedText.includes(normalizedProduct)) return 0.98;

  const tokens = productTokens(productName).map(normalize);
  const matched = tokens.filter((token) => normalizedText.includes(token));
  const targetGroup = findProductGroup(productName);
  const groupMatched = Boolean(targetGroup?.some((term) => normalizedText.includes(normalize(term))));
  const targetBrandMatched = hasTargetBrandSignal(normalizedText, productName);
  const skuTokens = requiredSkuTokens(productName);
  const missingSkuTokens = skuTokens.filter((token) => !normalizedText.includes(token));

  if (!tokens.length) return groupMatched || targetBrandMatched ? 0.74 : 0.2;
  if (tokens.length === 1) {
    if (matched.length && (groupMatched || targetBrandMatched)) return 0.86;
    if (matched.length) return 0.56;
    return groupMatched ? 0.62 : 0.2;
  }

  if (missingSkuTokens.length) {
    if (matched.length >= Math.max(2, tokens.length - missingSkuTokens.length) && (groupMatched || targetBrandMatched)) return 0.68;
    if (matched.length >= 2) return 0.58;
    return groupMatched || targetBrandMatched ? 0.46 : 0.24;
  }

  const span = orderedTokenSpan(normalizedText, tokens);
  const compactSkuMatch = span > 0 && span <= normalizedProduct.length + Math.max(10, normalizedProduct.length * 0.45);
  const looseOrderedSkuMatch = span > 0 && span <= normalizedProduct.length * 3;
  const requiredMatches = skuTokens.length ? Math.max(2, tokens.length - 1) : Math.min(2, tokens.length);

  if (matched.length === tokens.length && compactSkuMatch) return 0.96;
  if (matched.length === tokens.length && looseOrderedSkuMatch && (groupMatched || targetBrandMatched)) return 0.9;
  if (matched.length >= requiredMatches && (groupMatched || targetBrandMatched)) return skuTokens.length ? 0.86 : 0.9;
  if (matched.length >= requiredMatches) return skuTokens.length ? 0.78 : 0.74;
  if (matched.length === 1 && (groupMatched || targetBrandMatched)) return 0.68;
  return 0.24;
}

export function productTokens(productName: string) {
  return Array.from(
    new Set(
      productName
        .split(/[\s/·,._()[\]-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .filter((token) => !GENERIC_TOKENS.has(token))
    )
  );
}

function hasStrongReviewSignal(text: string) {
  return REVIEW_SIGNAL.test(normalize(text));
}

function hasVocSignal(text: string) {
  return REVIEW_SIGNAL.test(normalize(text));
}

function hasOtherDominantProduct(text: string, productName: string) {
  const normalizedText = normalize(text);
  const normalizedProduct = normalize(productName);
  if (!normalizedText || !normalizedProduct) return false;
  if (normalizedText.includes(normalizedProduct)) return false;

  const targetGroup = findProductGroup(productName);
  const otherMaeilGroupMatched = MAEIL_PRODUCT_GROUPS.some((group) => {
    if (group === targetGroup) return false;
    return group.some((term) => normalizedText.includes(normalize(term)));
  });
  const competitorMatched = COMPETITOR_TERMS.some((term) => normalizedText.includes(term));
  if (!otherMaeilGroupMatched && !competitorMatched) return false;

  return productRelevanceScore(text, productName) < 0.9;
}

function findProductGroup(productName: string) {
  const normalizedProduct = normalize(productName);
  return MAEIL_PRODUCT_GROUPS.find((group) => group.some((term) => normalizedProduct.includes(normalize(term))));
}

function hasTargetBrandSignal(normalizedText: string, productName: string) {
  const normalizedProduct = normalize(productName);
  if (normalizedProduct.includes("매일바이오")) return normalizedText.includes("매일바이오") || normalizedText.includes("바이오그릭");
  if (normalizedProduct.includes("매일유업")) return normalizedText.includes("매일유업");
  if (normalizedProduct.includes("상하")) return normalizedText.includes("상하");
  if (normalizedProduct.includes("셀렉스")) return normalizedText.includes("셀렉스");
  return normalizedText.includes("매일유업");
}

function requiredSkuTokens(productName: string) {
  const tokens = productTokens(productName).map(normalize);
  return tokens.filter((token) => SKU_IDENTIFIER_TERMS.some((identifier) => token.includes(identifier) || identifier.includes(token)));
}

function orderedTokenSpan(normalizedText: string, tokens: string[]) {
  let cursor = 0;
  let start = -1;
  let end = -1;
  for (const token of tokens) {
    const index = normalizedText.indexOf(token, cursor);
    if (index === -1) return -1;
    if (start === -1) start = index;
    end = index + token.length;
    cursor = end;
  }
  return end - start;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}
