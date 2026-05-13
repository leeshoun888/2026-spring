import { buildDashboardData } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await buildDashboardData(url.searchParams.get("runId") || undefined);
  return Response.json(data);
}
