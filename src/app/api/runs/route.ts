import { readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const store = await readStore();
  return Response.json({ runs: store.runs });
}
