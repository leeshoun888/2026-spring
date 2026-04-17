import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import {
  approveTu03,
  approveTu06,
  buildStateBundle,
  regenerateTu01AndTu02,
  regenerateTu02,
  regenerateTu03,
  regenerateTu04AndTu05,
  regenerateTu05,
  regenerateTu06,
  resetPipeline,
  selectTu02Item,
  selectTu05Item,
  startPipeline
} from "./pipeline-engine.js";
import {
  createDefaultSettings,
  getPublicSettingsSnapshot,
  getSettingsSnapshot,
  getStateSnapshot,
  initializeStore,
  mutateStore
} from "./store.js";

const PORT = Number(process.env.PORT || 4020);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, {
    ok: false,
    error: message
  });
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("요청 본문이 유효한 JSON 형식이 아닙니다.");
  }
}

function toClientSettings(realSettings) {
  const publicSettings = getPublicSettingsSnapshot();

  return {
    llm: {
      provider: realSettings.llm.provider,
      model: realSettings.llm.model,
      endpoint: realSettings.llm.endpoint,
      keyHeader: realSettings.llm.keyHeader,
      hasApiKey: Boolean(realSettings.llm.apiKey),
      apiKeyMasked: publicSettings.llm.apiKey
    },
    image: {
      provider: realSettings.image.provider,
      model: realSettings.image.model,
      endpointLow: realSettings.image.endpointLow,
      endpointHigh: realSettings.image.endpointHigh,
      keyHeader: realSettings.image.keyHeader,
      hasApiKey: Boolean(realSettings.image.apiKey),
      apiKeyMasked: publicSettings.image.apiKey
    },
    video: {
      provider: realSettings.video.provider,
      model: realSettings.video.model,
      endpointLow: realSettings.video.endpointLow,
      endpointHigh: realSettings.video.endpointHigh,
      keyHeader: realSettings.video.keyHeader,
      hasApiKey: Boolean(realSettings.video.apiKey),
      apiKeyMasked: publicSettings.video.apiKey
    }
  };
}

function getClientBundle() {
  const state = getStateSnapshot();
  const settings = getSettingsSnapshot();
  return {
    ok: true,
    state,
    settings: toClientSettings(settings)
  };
}

function sanitizeInputString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}

function applySectionPatch(target, incoming, defaults, sectionKey) {
  if (!incoming || typeof incoming !== "object") {
    return;
  }

  const section = target[sectionKey];
  const defaultSection = defaults[sectionKey];

  if (typeof incoming.provider === "string") {
    section.provider = sanitizeInputString(incoming.provider, defaultSection.provider) || defaultSection.provider;
  }
  if (typeof incoming.model === "string") {
    section.model = sanitizeInputString(incoming.model, defaultSection.model);
  }

  if (typeof incoming.endpoint === "string" && "endpoint" in section) {
    section.endpoint = sanitizeInputString(incoming.endpoint);
  }
  if (typeof incoming.endpointLow === "string" && "endpointLow" in section) {
    section.endpointLow = sanitizeInputString(incoming.endpointLow);
  }
  if (typeof incoming.endpointHigh === "string" && "endpointHigh" in section) {
    section.endpointHigh = sanitizeInputString(incoming.endpointHigh);
  }
  if (typeof incoming.keyHeader === "string") {
    section.keyHeader = sanitizeInputString(incoming.keyHeader, defaultSection.keyHeader) || defaultSection.keyHeader;
  }

  if (incoming.clearApiKey === true) {
    section.apiKey = "";
  }

  if (typeof incoming.apiKey === "string") {
    const candidate = incoming.apiKey.trim();
    if (candidate && !candidate.includes("*")) {
      section.apiKey = candidate;
    }
  }
}

async function updateSettings(payload) {
  return mutateStore(async (_state, settings) => {
    const defaults = createDefaultSettings();
    applySectionPatch(settings, payload.llm, defaults, "llm");
    applySectionPatch(settings, payload.image, defaults, "image");
    applySectionPatch(settings, payload.video, defaults, "video");
    return buildStateBundle();
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "galahad-pipeline",
      now: new Date().toISOString()
    });
  }

  if (req.method === "GET" && pathname === "/api/state") {
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await readRequestBody(req);
    await updateSettings(body);
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/pipeline/reset") {
    await resetPipeline();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/pipeline/start") {
    const body = await readRequestBody(req);
    await startPipeline({
      cutDescription: body.cutDescription,
      cutPurpose: body.cutPurpose
    });
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu01/regenerate") {
    await regenerateTu01AndTu02();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu02/regenerate") {
    await regenerateTu02();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu02/select") {
    const body = await readRequestBody(req);
    await selectTu02Item({ itemId: body.itemId });
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu03/regenerate") {
    await regenerateTu03();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu03/approve") {
    await approveTu03();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu04/regenerate") {
    await regenerateTu04AndTu05();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu05/regenerate") {
    await regenerateTu05();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu05/select") {
    const body = await readRequestBody(req);
    await selectTu05Item({ itemId: body.itemId });
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu06/regenerate") {
    await regenerateTu06();
    return sendJson(res, 200, getClientBundle());
  }

  if (req.method === "POST" && pathname === "/api/tu06/approve") {
    await approveTu06();
    return sendJson(res, 200, getClientBundle());
  }

  sendError(res, 404, "API 경로를 찾을 수 없습니다.");
}

async function serveStatic(req, res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(normalized).replace(/^([.][.][/\\])+/, "");
  const absolutePath = path.join(PUBLIC_DIR, safePath);

  let finalPath = absolutePath;
  try {
    const stat = await fs.stat(finalPath);
    if (stat.isDirectory()) {
      finalPath = path.join(finalPath, "index.html");
    }
  } catch {
    finalPath = path.join(PUBLIC_DIR, "index.html");
  }

  let body;
  try {
    body = await fs.readFile(finalPath);
  } catch {
    return sendError(res, 404, "정적 파일을 찾을 수 없습니다.");
  }

  const ext = path.extname(finalPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length
  });
  res.end(body);
}

async function start() {
  await initializeStore();

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
      const pathname = requestUrl.pathname;

      if (pathname.startsWith("/api/")) {
        await handleApi(req, res, pathname);
        return;
      }

      await serveStatic(req, res, pathname);
    } catch (error) {
      sendError(res, 500, error.message || "서버 내부 오류가 발생했습니다.");
    }
  });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Galahad pipeline server running at http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
