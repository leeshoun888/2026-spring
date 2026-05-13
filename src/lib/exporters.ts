import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import * as XLSX from "xlsx";
import type { DashboardData, InsightItem, VocRecord } from "./types";

const REPORT_DATE = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Seoul"
});

export function buildJsonExport(data: DashboardData) {
  return Buffer.from(JSON.stringify(data, null, 2), "utf8");
}

export function buildExcelExport(data: DashboardData) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { metric: "제품", value: data.metadata.productName },
      { metric: "총 VOC", value: data.metadata.totalVocCount },
      { metric: "긍정 비율", value: data.aggregation.sentimentPct.positive },
      { metric: "중립 비율", value: data.aggregation.sentimentPct.neutral },
      { metric: "부정 비율", value: data.aggregation.sentimentPct.negative },
      { metric: "1인칭 리뷰", value: data.aggregation.quality.firstPersonReviewCount },
      { metric: "고위험 VOC", value: data.aggregation.quality.highRiskCount }
    ]),
    "Executive Summary"
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.vocRecords.map(toFlatRecord)), "Normalized VOC");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.rawItems), "Raw Items");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      ...data.insights.pain.map((item) => toInsightRow("Pain", item)),
      ...data.insights.strength.map((item) => toInsightRow("Strength", item)),
      ...data.insights.opportunity.map((item) => toInsightRow("Opportunity", item)),
      ...data.insights.risk.map((item) => toInsightRow("Risk", item))
    ]),
    "Insights"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildWordExport(data: DashboardData) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: "Maeil VOC Intelligence Report", heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `${data.metadata.productName} | ${REPORT_DATE.format(new Date())}`, color: "00448B", bold: true })]
          }),
          spacer(),
          new Paragraph({ text: "Executive Snapshot", heading: HeadingLevel.HEADING_1 }),
          bullet(`총 VOC ${data.metadata.totalVocCount.toLocaleString()}건 분석`),
          bullet(`긍정 ${data.aggregation.sentimentPct.positive}% / 중립 ${data.aggregation.sentimentPct.neutral}% / 부정 ${data.aggregation.sentimentPct.negative}%`),
          bullet(`1인칭 리뷰 ${data.aggregation.quality.firstPersonReviewCount.toLocaleString()}건, 고위험 VOC ${data.aggregation.quality.highRiskCount.toLocaleString()}건`),
          spacer(),
          new Paragraph({ text: "Key Risks", heading: HeadingLevel.HEADING_1 }),
          ...insightParagraphs(data.insights.risk),
          new Paragraph({ text: "Customer Pain Points", heading: HeadingLevel.HEADING_1 }),
          ...insightParagraphs(data.insights.pain),
          new Paragraph({ text: "Strengths & Opportunities", heading: HeadingLevel.HEADING_1 }),
          ...insightParagraphs([...data.insights.strength, ...data.insights.opportunity]),
          new Paragraph({ text: "Representative VOC", heading: HeadingLevel.HEADING_1 }),
          buildVocTable(data.vocRecords.slice(0, 18))
        ]
      }
    ]
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export function buildPdfExport(data: DashboardData) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: "Maeil VOC Intelligence Report" } });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerKoreanFont(doc);
    doc.fillColor("#00448B").fontSize(13).text("Maeil VOC Intelligence", { continued: false });
    doc.moveDown(0.7);
    doc.fillColor("#1d1d1f").fontSize(26).text(`${data.metadata.productName} VOC 분석 보고서`, { lineGap: 4 });
    doc.moveDown(0.4);
    doc.fillColor("#6e6e73").fontSize(10).text(REPORT_DATE.format(new Date()));
    doc.moveDown(1.2);

    metricLine(doc, "총 VOC", `${data.metadata.totalVocCount.toLocaleString()}건`);
    metricLine(doc, "감성", `긍정 ${data.aggregation.sentimentPct.positive}% / 중립 ${data.aggregation.sentimentPct.neutral}% / 부정 ${data.aggregation.sentimentPct.negative}%`);
    metricLine(doc, "검증 품질", `1인칭 리뷰 ${data.aggregation.quality.firstPersonReviewCount.toLocaleString()}건, 평균 관련도 ${data.aggregation.quality.averageRelevanceScore}`);
    metricLine(doc, "고위험 VOC", `${data.aggregation.quality.highRiskCount.toLocaleString()}건`);
    doc.moveDown(1.2);

    pdfSection(doc, "임원 핵심 리스크", data.insights.risk);
    pdfSection(doc, "반복 불만", data.insights.pain);
    pdfSection(doc, "강점 및 기회", [...data.insights.strength, ...data.insights.opportunity].slice(0, 6));
    doc.addPage();
    doc.fillColor("#00448B").fontSize(15).text("대표 VOC 원문 근거");
    doc.moveDown(0.6);
    data.vocRecords.slice(0, 20).forEach((record, index) => {
      doc.fillColor("#1d1d1f").fontSize(10).text(`${index + 1}. [${record.sourceName}] ${record.title}`, { lineGap: 2 });
      doc.fillColor("#424245").fontSize(9).text(record.quote, { lineGap: 2 });
      doc.fillColor("#00448B").fontSize(9).text(`Action: ${record.recommendedAction || record.insight}`);
      doc.moveDown(0.7);
    });
    doc.end();
  });
}

function toFlatRecord(record: VocRecord) {
  return {
    id: record.id,
    source: record.sourceName,
    date: record.date,
    title: record.title,
    quote: record.quote,
    sentiment: record.sentiment,
    category: record.category,
    categorySecondary: record.categorySecondary,
    keywords: record.keywords.join(", "),
    relevanceScore: record.relevanceScore,
    isProductRelevant: record.isProductRelevant,
    isFirstPersonReview: record.isFirstPersonReview,
    severity: record.severity,
    businessImpact: record.businessImpact,
    summary: record.summary,
    insight: record.insight,
    evidence: record.evidence,
    recommendedAction: record.recommendedAction,
    url: record.url
  };
}

function toInsightRow(type: string, item: InsightItem) {
  return {
    type,
    title: item.title,
    desc: item.desc,
    count: item.count,
    severity: item.severity || "",
    urgency: item.urgency || "",
    evidenceIds: item.ids.join(", ")
  };
}

function insightParagraphs(items: InsightItem[]) {
  const safeItems = items.length ? items : [{ title: "분석 대기", desc: "VOC 데이터가 쌓이면 자동으로 생성됩니다.", count: 0, ids: [] }];
  return safeItems.flatMap((item) => [
    new Paragraph({ children: [new TextRun({ text: `${item.title} (${item.count}건)`, bold: true, color: "1D1D1F" })] }),
    new Paragraph({ text: item.desc, spacing: { after: 180 } })
  ]);
}

function buildVocTable(records: VocRecord[]) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ["출처", "감성", "카테고리", "요약", "권고"].map((text) => cell(text, true))
    }),
    ...records.map((record) =>
      new TableRow({
        children: [
          cell(record.sourceName),
          cell(record.sentiment),
          cell(record.category),
          cell(record.summary),
          cell(record.recommendedAction || record.insight)
        ]
      })
    )
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function cell(text: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: text || "-", bold })] })]
  });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 } });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 180 } });
}

function registerKoreanFont(doc: PDFKit.PDFDocument) {
  try {
    doc.registerFont("Korean", "/System/Library/Fonts/AppleSDGothicNeo.ttc");
    doc.font("Korean");
  } catch {
    doc.font("Helvetica");
  }
}

function metricLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fillColor("#00448B").fontSize(10).text(label, { continued: true });
  doc.fillColor("#1d1d1f").text(`  ${value}`);
}

function pdfSection(doc: PDFKit.PDFDocument, title: string, items: InsightItem[]) {
  doc.fillColor("#00448B").fontSize(15).text(title);
  doc.moveDown(0.35);
  const safeItems = items.length ? items : [{ title: "분석 대기", desc: "VOC 데이터가 쌓이면 자동으로 생성됩니다.", count: 0, ids: [] }];
  safeItems.slice(0, 5).forEach((item) => {
    doc.fillColor("#1d1d1f").fontSize(11).text(`${item.title} (${item.count}건)`);
    doc.fillColor("#424245").fontSize(9).text(item.desc, { lineGap: 2 });
    doc.moveDown(0.55);
  });
  doc.moveDown(0.8);
}
