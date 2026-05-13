import * as XLSX from "xlsx";
import { analyzeRawItemsLocally } from "./analyzer";
import { isStrictValidVoc } from "./gates";
import { addRun, appendData, updateRun } from "./store";
import type { AnalysisRun, RawItem } from "./types";
import { clampText, stableId, toIsoDate } from "./utils";

const MAX_IMPORT_ROWS = 10000;

const REVIEW_COLUMNS = ["리뷰내용", "리뷰 내용", "구매평", "상품평", "후기", "리뷰", "내용", "comment", "review"];
const PRODUCT_COLUMNS = ["상품명", "상품 이름", "상품", "제품명", "제품", "productname", "product"];
const OPTION_COLUMNS = ["옵션명", "옵션", "optionname", "option"];
const DATE_COLUMNS = ["작성일", "등록일", "리뷰작성일", "구매확정일", "날짜", "date", "createdat"];
const RATING_COLUMNS = ["평점", "별점", "점수", "rating", "score", "star"];
const AUTHOR_COLUMNS = ["작성자", "구매자", "아이디", "닉네임", "id", "author", "user"];
const ID_COLUMNS = ["리뷰번호", "구매평번호", "상품평번호", "고유번호", "번호", "reviewid", "id"];

type ImportedRow = Record<string, unknown>;

export async function importReviewWorkbook(productName: string, fileName: string, buffer: Buffer) {
  const startedAt = new Date().toISOString();
  const run: AnalysisRun = {
    id: `run-${Date.now()}`,
    productName: productName || "스마트스토어 리뷰",
    status: "running",
    startedAt,
    rawCount: 0,
    vocCount: 0
  };
  await addRun(run);

  try {
    const rows = readWorkbookRows(buffer);
    const rawItems = rowsToRawItems(rows, run.productName, fileName, run.id);
    const vocRecords = analyzeRawItemsLocally(run.productName, rawItems)
      .filter((record) => isStrictValidVoc(record, run.productName))
      .map((record) => ({
        ...record,
        sourceName: "네이버 스마트스토어 리뷰",
        isFirstPersonReview: true,
        isVoc: true,
        evidence: "판매자센터에서 내려받은 구매 리뷰 엑셀 원문입니다."
      }));

    await appendData(run.id, rawItems, vocRecords);
    const completedRun = {
      ...run,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      rawCount: rawItems.length,
      vocCount: vocRecords.length
    };
    await updateRun(run.id, completedRun);
    return completedRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : "리뷰 엑셀 업로드에 실패했습니다.";
    await updateRun(run.id, { status: "failed", completedAt: new Date().toISOString(), error: message });
    throw error;
  }
}

function readWorkbookRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("엑셀 파일에서 시트를 찾을 수 없습니다.");
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<ImportedRow>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("엑셀 파일에 읽을 수 있는 행이 없습니다.");
  return rows.slice(0, MAX_IMPORT_ROWS);
}

function rowsToRawItems(rows: ImportedRow[], productName: string, fileName: string, runId: string): RawItem[] {
  return rows
    .map((row, index) => {
      const review = pickValue(row, REVIEW_COLUMNS) || pickLongestText(row);
      if (!review || review.length < 2) return null;
      const rowProductName = pickValue(row, PRODUCT_COLUMNS) || productName;
      const optionName = pickValue(row, OPTION_COLUMNS);
      const rating = pickValue(row, RATING_COLUMNS);
      const writtenAt = toIsoDate(pickValue(row, DATE_COLUMNS));
      const author = maskAuthor(pickValue(row, AUTHOR_COLUMNS));
      const reviewId = pickValue(row, ID_COLUMNS);
      const title = [rowProductName, optionName, rating ? `평점 ${rating}` : ""].filter(Boolean).join(" · ");
      const rawId = stableId("raw", `smartstore:${reviewId || ""}:${rowProductName}:${optionName}:${writtenAt}:${review}:${index}`);

      return {
        id: rawId,
        runId,
        source: "smartstore_review" as const,
        sourceName: "네이버 스마트스토어 리뷰",
        query: productName,
        title: clampText(title || productName, 240),
        content: clampText(review, 1200),
        url: "",
        author,
        publishedAt: writtenAt,
        collectedAt: new Date().toISOString()
      };
    })
    .filter(Boolean) as RawItem[];
}

function pickValue(row: ImportedRow, candidates: string[]) {
  const entries = Object.entries(row);
  const exact = entries.find(([key]) => candidates.some((candidate) => normalizeHeader(key) === normalizeHeader(candidate)));
  const partial = exact || entries.find(([key]) => candidates.some((candidate) => normalizeHeader(key).includes(normalizeHeader(candidate))));
  return cleanValue(partial?.[1]);
}

function pickLongestText(row: ImportedRow) {
  return Object.values(row)
    .map(cleanValue)
    .filter((value) => value.length >= 8)
    .sort((a, b) => b.length - a.length)[0] || "";
}

function cleanValue(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_()[\]\-./]/g, "");
}

function maskAuthor(value: string) {
  if (!value) return undefined;
  if (value.length <= 2) return `${value.slice(0, 1)}*`;
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}
