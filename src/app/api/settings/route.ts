import { getSettings, saveSettings } from "@/lib/store";
import type { Settings } from "@/lib/types";

export async function GET() {
  const settings = await getSettings();
  return Response.json(maskSettings(settings));
}

export async function POST(request: Request) {
  const settings = (await request.json()) as Settings;
  await saveSettings(settings);
  const saved = await getSettings();
  return Response.json(maskSettings(saved));
}

function maskSettings(settings: Settings) {
  return {
    naverClientId: mask(settings.naverClientId),
    naverClientSecret: mask(settings.naverClientSecret),
    youtubeApiKey: mask(settings.youtubeApiKey),
    openaiApiKey: mask(settings.openaiApiKey),
    openaiModel: settings.openaiModel || "gpt-4o-mini",
    cronSecret: mask(settings.cronSecret),
    hasNaver: Boolean(settings.naverClientId && settings.naverClientSecret),
    hasYoutube: Boolean(settings.youtubeApiKey),
    hasOpenAI: Boolean(settings.openaiApiKey)
  };
}

function mask(value?: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
