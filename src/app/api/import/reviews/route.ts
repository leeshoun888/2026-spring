import { importReviewWorkbook } from "@/lib/importReviews";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const productName = String(formData?.get("productName") || "스마트스토어 리뷰");

  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "업로드할 엑셀 파일이 필요합니다." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const run = await importReviewWorkbook(productName, file.name, buffer);
    return Response.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "리뷰 엑셀 업로드에 실패했습니다.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
