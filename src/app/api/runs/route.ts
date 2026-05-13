import { moveRunToTrash, readStore, restoreRun } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const store = await readStore();
  return Response.json({
    runs: store.runs.filter((run) => !run.deletedAt),
    trashedRuns: store.runs.filter((run) => run.deletedAt)
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const runId = String(body.runId || "");
  const action = String(body.action || "");
  if (!runId) return Response.json({ ok: false, error: "runId가 필요합니다." }, { status: 400 });

  if (action === "trash") {
    await moveRunToTrash(runId);
    return Response.json({ ok: true });
  }

  if (action === "restore") {
    await restoreRun(runId);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "지원하지 않는 작업입니다." }, { status: 400 });
}
