import { runAnalysis } from "@/lib/pipeline";
import { getSettings } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const settings = await getSettings();
  const secret = settings.cronSecret;
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  if (secret && auth !== secret && querySecret !== secret) {
    return Response.json({ ok: false, error: "Unauthorized cron invocation" }, { status: 401 });
  }

  const run = await runAnalysis();
  return Response.json({ ok: true, run });
}
