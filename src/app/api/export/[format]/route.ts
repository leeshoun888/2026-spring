import { buildDashboardData } from "@/lib/store";
import { buildExcelExport, buildJsonExport, buildPdfExport, buildWordExport } from "@/lib/exporters";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf"
};

export async function GET(request: Request) {
  const format = new URL(request.url).pathname.split("/").pop() || "json";
  const data = await buildDashboardData();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `maeil-voc-${date}.${format}`;

  let body: Buffer;
  if (format === "json") body = buildJsonExport(data);
  else if (format === "xlsx") body = buildExcelExport(data);
  else if (format === "docx") body = await buildWordExport(data);
  else if (format === "pdf") body = await buildPdfExport(data);
  else return Response.json({ ok: false, error: "Unsupported export format" }, { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
