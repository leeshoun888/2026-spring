import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

export const STAGE_KEYS = ["tu01", "tu02", "tu03", "tu04", "tu05", "tu06"];

function nowIso() {
  return new Date().toISOString();
}

export function createEmptyStage() {
  return {
    status: "대기",
    batches: [],
    activeBatchId: null,
    selectedItemId: null,
    approvedItemId: null,
    updatedAt: nowIso()
  };
}

export function createInitialState() {
  return {
    pipelineStatus: "idle",
    currentCut: null,
    finalOutput: null,
    stages: Object.fromEntries(STAGE_KEYS.map((key) => [key, createEmptyStage()])),
    updatedAt: nowIso()
  };
}

export function createDefaultSettings() {
  return {
    llm: {
      provider: "mock",
      apiKey: "",
      model: "gpt-5-mini",
      endpoint: "",
      keyHeader: "Authorization"
    },
    image: {
      provider: "mock",
      apiKey: "",
      model: "gpt-image-1",
      endpointLow: "",
      endpointHigh: "",
      keyHeader: "Authorization"
    },
    video: {
      provider: "mock",
      apiKey: "",
      model: "",
      endpointLow: "",
      endpointHigh: "",
      keyHeader: "Authorization"
    },
    updatedAt: nowIso()
  };
}

let state = createInitialState();
let settings = createDefaultSettings();
let mutationChain = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  const serialized = JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, serialized, "utf-8");
}

function withTimestamps() {
  state.updatedAt = nowIso();
  settings.updatedAt = nowIso();
}

export async function initializeStore() {
  await ensureDataDir();
  state = await readJson(STATE_PATH, createInitialState());
  settings = await readJson(SETTINGS_PATH, createDefaultSettings());

  if (!state?.stages) {
    state = createInitialState();
  }

  for (const stageKey of STAGE_KEYS) {
    if (!state.stages[stageKey]) {
      state.stages[stageKey] = createEmptyStage();
    }
  }

  if (!settings?.llm || !settings?.image || !settings?.video) {
    settings = createDefaultSettings();
  }

  withTimestamps();
  await persistStore();
}

export async function persistStore() {
  withTimestamps();
  await Promise.all([writeJson(STATE_PATH, state), writeJson(SETTINGS_PATH, settings)]);
}

export function getStateSnapshot() {
  return structuredClone(state);
}

export function getSettingsSnapshot() {
  return structuredClone(settings);
}

export function getPublicSettingsSnapshot() {
  const copied = structuredClone(settings);
  copied.llm.apiKey = copied.llm.apiKey ? maskKey(copied.llm.apiKey) : "";
  copied.image.apiKey = copied.image.apiKey ? maskKey(copied.image.apiKey) : "";
  copied.video.apiKey = copied.video.apiKey ? maskKey(copied.video.apiKey) : "";
  return copied;
}

function maskKey(key) {
  if (key.length <= 8) {
    return "*".repeat(key.length);
  }
  return `${key.slice(0, 4)}${"*".repeat(Math.max(0, key.length - 8))}${key.slice(-4)}`;
}

export async function mutateStore(mutator) {
  mutationChain = mutationChain.then(async () => {
    const result = await mutator(state, settings);
    await persistStore();
    return result;
  });
  return mutationChain;
}

export async function replaceState(nextState) {
  state = nextState;
  await persistStore();
}

export async function replaceSettings(nextSettings) {
  settings = nextSettings;
  await persistStore();
}
