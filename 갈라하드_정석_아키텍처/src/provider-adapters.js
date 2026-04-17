const MOCK_VIDEO_URLS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
];

export async function makeImagePrompts({ cutDescription, cutPurpose, count = 3, settings }) {
  const provider = settings.llm.provider;

  if (provider === "openai" && settings.llm.apiKey) {
    try {
      const text = await callOpenAIText({
        apiKey: settings.llm.apiKey,
        model: settings.llm.model || "gpt-5-mini",
        instruction: [
          "다음 컷 설명을 바탕으로 이미지 생성 프롬프트를 3개 작성하세요.",
          "각 프롬프트는 1줄로 작성하고, 스타일/카메라/조명을 구체화하세요.",
          "번호 목록(1.,2.,3.)으로만 출력하세요.",
          `컷 설명: ${cutDescription}`,
          `컷 목적: ${cutPurpose || "미정"}`
        ].join("\n")
      });

      const prompts = parseNumberedList(text, count);
      if (prompts.length === count) {
        return prompts;
      }
    } catch {
      // API 실패 시 mock으로 자동 폴백
    }
  }

  if (provider === "custom" && settings.llm.endpoint) {
    try {
      const payload = {
        task: "image_prompts",
        count,
        cutDescription,
        cutPurpose,
        model: settings.llm.model
      };
      const text = await callCustomTextEndpoint({
        endpoint: settings.llm.endpoint,
        apiKey: settings.llm.apiKey,
        keyHeader: settings.llm.keyHeader,
        payload
      });
      const prompts = parseNumberedList(text, count);
      if (prompts.length === count) {
        return prompts;
      }
    } catch {
      // API 실패 시 mock으로 자동 폴백
    }
  }

  return buildMockPrompts(cutDescription, cutPurpose, count, "image");
}

export async function makeVideoPrompts({ cutDescription, cutPurpose, baseImageUrl, count = 3, settings }) {
  const provider = settings.llm.provider;

  if (provider === "openai" && settings.llm.apiKey) {
    try {
      const text = await callOpenAIText({
        apiKey: settings.llm.apiKey,
        model: settings.llm.model || "gpt-5-mini",
        instruction: [
          "다음 입력으로 영상화 프롬프트를 3개 생성하세요.",
          "각 프롬프트는 동작, 카메라 무빙, 길이감, 분위기를 포함해야 합니다.",
          "번호 목록(1.,2.,3.)으로만 출력하세요.",
          `컷 설명: ${cutDescription}`,
          `컷 목적: ${cutPurpose || "미정"}`,
          `기준 이미지 URL: ${baseImageUrl}`
        ].join("\n")
      });
      const prompts = parseNumberedList(text, count);
      if (prompts.length === count) {
        return prompts;
      }
    } catch {
      // API 실패 시 mock으로 자동 폴백
    }
  }

  if (provider === "custom" && settings.llm.endpoint) {
    try {
      const payload = {
        task: "video_prompts",
        count,
        cutDescription,
        cutPurpose,
        baseImageUrl,
        model: settings.llm.model
      };
      const text = await callCustomTextEndpoint({
        endpoint: settings.llm.endpoint,
        apiKey: settings.llm.apiKey,
        keyHeader: settings.llm.keyHeader,
        payload
      });
      const prompts = parseNumberedList(text, count);
      if (prompts.length === count) {
        return prompts;
      }
    } catch {
      // API 실패 시 mock으로 자동 폴백
    }
  }

  return buildMockPrompts(cutDescription, cutPurpose, count, "video");
}

export async function renderImage({ prompt, quality, settings }) {
  const provider = settings.image.provider;

  if (provider === "openai" && settings.image.apiKey) {
    try {
      const url = await callOpenAIImage({
        apiKey: settings.image.apiKey,
        model: settings.image.model || "gpt-image-1",
        prompt,
        quality
      });
      return {
        url,
        provider: "openai"
      };
    } catch {
      // API 실패 시 mock으로 자동 폴백
    }
  }

  if (provider === "custom") {
    const endpoint = quality === "high" ? settings.image.endpointHigh : settings.image.endpointLow;
    if (endpoint) {
      try {
        const url = await callCustomMediaEndpoint({
          endpoint,
          apiKey: settings.image.apiKey,
          keyHeader: settings.image.keyHeader,
          payload: {
            prompt,
            quality,
            model: settings.image.model,
            kind: "image"
          }
        });
        return {
          url,
          provider: "custom"
        };
      } catch {
        // API 실패 시 mock으로 자동 폴백
      }
    }
  }

  return {
    url: makeMockImageDataUri(prompt, quality === "high" ? "HQ IMAGE" : "LQ IMAGE"),
    provider: "mock"
  };
}

export async function renderVideo({ prompt, baseImageUrl, quality, settings }) {
  const provider = settings.video.provider;

  if (provider === "custom") {
    const endpoint = quality === "high" ? settings.video.endpointHigh : settings.video.endpointLow;
    if (endpoint) {
      try {
        const url = await callCustomMediaEndpoint({
          endpoint,
          apiKey: settings.video.apiKey,
          keyHeader: settings.video.keyHeader,
          payload: {
            prompt,
            baseImageUrl,
            quality,
            model: settings.video.model,
            kind: "video"
          }
        });
        return {
          url,
          provider: "custom"
        };
      } catch {
        // API 실패 시 mock으로 자동 폴백
      }
    }
  }

  const index = hashText(`${prompt}-${quality}-${baseImageUrl || ""}`) % MOCK_VIDEO_URLS.length;
  return {
    url: `${MOCK_VIDEO_URLS[index]}?mock=${Date.now()}`,
    provider: "mock"
  };
}

async function callOpenAIText({ apiKey, model, instruction }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: instruction
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI text error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  if (!text) {
    throw new Error("OpenAI text: output text not found");
  }
  return text;
}

async function callOpenAIImage({ apiKey, model, prompt, quality }) {
  const size = quality === "high" ? "1536x1024" : "1024x1024";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt,
      size
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI image error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const first = data?.data?.[0];
  if (!first) {
    throw new Error("OpenAI image: empty result");
  }

  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  if (first.url) {
    return first.url;
  }

  throw new Error("OpenAI image: unsupported result format");
}

async function callCustomTextEndpoint({ endpoint, apiKey, keyHeader, payload }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(apiKey, keyHeader),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom text endpoint error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = data.text || data.output || data.result;
  if (!text || typeof text !== "string") {
    throw new Error("Custom text endpoint: no text field (text/output/result)");
  }
  return text;
}

async function callCustomMediaEndpoint({ endpoint, apiKey, keyHeader, payload }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(apiKey, keyHeader),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom media endpoint error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const url =
    data.url ||
    data.imageUrl ||
    data.videoUrl ||
    (Array.isArray(data.output) ? data.output[0] : data.output) ||
    null;

  if (!url || typeof url !== "string") {
    throw new Error("Custom media endpoint: no media URL field");
  }

  return url;
}

function buildAuthHeaders(apiKey, keyHeader = "Authorization") {
  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    if (keyHeader.toLowerCase() === "authorization") {
      headers.Authorization = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    } else {
      headers[keyHeader] = apiKey;
    }
  }

  return headers;
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputs = Array.isArray(data.output) ? data.output : [];
  const chunks = [];
  for (const node of outputs) {
    const content = Array.isArray(node.content) ? node.content : [];
    for (const part of content) {
      if (typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseNumberedList(text, expectedCount) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .map((line) => line.replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);

  const unique = [];
  for (const line of lines) {
    if (!unique.includes(line)) {
      unique.push(line);
    }
    if (unique.length >= expectedCount) {
      break;
    }
  }
  return unique;
}

function buildMockPrompts(cutDescription, cutPurpose, count, mode) {
  const purpose = cutPurpose || "브랜드 메시지 전달";
  const styleSeeds =
    mode === "image"
      ? [
          "cinematic close-up, softbox key light, high texture detail",
          "dynamic wide shot, ad-film color grading, clean product focus",
          "editorial composition, premium mood, shallow depth of field"
        ]
      : [
          "slow dolly-in, natural motion blur, 5-second commercial pacing",
          "arc shot around subject, controlled camera shake, atmospheric lighting",
          "push-pull zoom transition, elegant movement, premium brand tone"
        ];

  return Array.from({ length: count }, (_, index) => {
    const style = styleSeeds[index % styleSeeds.length];
    if (mode === "image") {
      return `${cutDescription} | 목적: ${purpose} | ${style}`;
    }
    return `${cutDescription} 기반 영상화, 목적: ${purpose}, 베이스 이미지 연속성 유지, ${style}`;
  });
}

function makeMockImageDataUri(prompt, label) {
  const safePrompt = escapeXml(prompt).slice(0, 180);
  const chunks = splitText(safePrompt, 48);
  const lines = chunks
    .map((line, idx) => `<tspan x="36" dy="${idx === 0 ? 0 : 26}">${line}</tspan>`)
    .join("");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#0b3d2e"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="24" y="24" width="1232" height="672" fill="none" stroke="#f59e0b" stroke-width="2"/>
  <text x="36" y="74" fill="#f8fafc" font-size="38" font-family="Arial, sans-serif" font-weight="700">${label}</text>
  <text x="36" y="126" fill="#f8fafc" font-size="27" font-family="Arial, sans-serif">${lines}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function splitText(text, maxLength) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength) {
      if (line) {
        lines.push(line);
      }
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [text];
}

function escapeXml(raw) {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
