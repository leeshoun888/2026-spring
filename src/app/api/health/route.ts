export async function GET() {
  return Response.json({ ok: true, service: "maeil-voc-agent", time: new Date().toISOString() });
}
