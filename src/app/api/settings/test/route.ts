import { testNaver } from "@/lib/naver";
import { getSettings } from "@/lib/store";
import { testYoutube } from "@/lib/youtube";

export async function GET() {
  const settings = await getSettings();
  const [naver, youtube] = await Promise.all([testNaver(settings), testYoutube(settings)]);
  return Response.json({
    naver,
    youtube,
    openai: settings.openaiApiKey
      ? { ok: true, message: `OpenAI 키가 설정되어 있습니다. 모델: ${settings.openaiModel || "gpt-4o-mini"}` }
      : { ok: false, message: "OpenAI API Key가 없어서 휴리스틱 분석 fallback을 사용합니다." }
  });
}
