import type { RawItem, VocRecord } from "./types";

const GENERIC_TOKENS = new Set([
  "매일",
  "매일유업",
  "바이오",
  "제품",
  "플러스",
  "후기",
  "리뷰",
  "추천"
]);

const VOC_SIGNAL = /후기|리뷰|먹어|먹었|마셔|마셨|샀|구매|재구매|추천|비추|좋|맛있|별로|불편|비싸|가격|배송|유통기한|환불|문의|댓글|장점|단점|만족|불만|아이|가족|운동|다이어트|식단/;
const NON_VOC_SIGNAL = /채용|공시|주가|증권|보도자료|행사|이벤트|캠페인 모집|서포터즈|레시피 공모|논문|학회|입찰|인사발령/;

export function isLikelyRelevantCandidate(item: RawItem, productName: string) {
  const text = normalize(`${item.title} ${item.content}`);
  const product = normalize(productName);
  if (!text || !product) return false;
  if (NON_VOC_SIGNAL.test(text) && !VOC_SIGNAL.test(text)) return false;
  if (text.includes(product)) return true;
  if (text.includes(product.replace(/\s+/g, ""))) return true;

  const tokens = productTokens(productName);
  const matched = tokens.filter((token) => text.includes(normalize(token)));
  const hasVocSignal = VOC_SIGNAL.test(text);
  if (tokens.length <= 1) return matched.length === 1 && hasVocSignal;
  return matched.length >= Math.min(2, tokens.length) && hasVocSignal;
}

export function isStrictValidVoc(record: VocRecord) {
  return (
    record.isVoc &&
    record.isProductRelevant &&
    record.relevanceScore >= 0.7 &&
    (record.isFirstPersonReview || hasStrongReviewSignal(`${record.title} ${record.quote}`))
  );
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
  return VOC_SIGNAL.test(normalize(text));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}
