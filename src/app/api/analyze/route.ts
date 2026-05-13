import { runAnalysis } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const config = await request.json().catch(() => ({}));
  try {
    const run = await runAnalysis(config);
    return Response.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 실행에 실패했습니다.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
