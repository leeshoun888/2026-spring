import crypto from "node:crypto";
import {
  STAGE_KEYS,
  createEmptyStage,
  createInitialState,
  getSettingsSnapshot,
  getStateSnapshot,
  mutateStore
} from "./store.js";
import {
  makeImagePrompts,
  makeVideoPrompts,
  renderImage,
  renderVideo
} from "./provider-adapters.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().split("-")[0]}`;
}

function setStageUpdated(stage) {
  stage.updatedAt = nowIso();
}

function archiveBatch(batch) {
  if (batch.archived) {
    return;
  }
  batch.archived = true;
  batch.archivedAt = nowIso();
  for (const item of batch.items) {
    if (item.lifecycle === "active") {
      item.lifecycle = "inactive/archived";
    }
  }
}

function getActiveBatch(stage) {
  if (!stage.activeBatchId) {
    return null;
  }
  return stage.batches.find((batch) => batch.id === stage.activeBatchId) || null;
}

function requireActiveBatch(stage, stageName) {
  const batch = getActiveBatch(stage);
  if (!batch) {
    throw new Error(`${stageName} 단계의 활성 배치가 없습니다.`);
  }
  return batch;
}

function activateBatch(stage, batch) {
  const active = getActiveBatch(stage);
  if (active) {
    archiveBatch(active);
  }
  stage.batches.unshift(batch);
  stage.activeBatchId = batch.id;
  stage.selectedItemId = null;
  stage.approvedItemId = null;
  setStageUpdated(stage);
}

function clearStage(stage) {
  const active = getActiveBatch(stage);
  if (active) {
    archiveBatch(active);
  }
  stage.activeBatchId = null;
  stage.selectedItemId = null;
  stage.approvedItemId = null;
  stage.status = "대기";
  setStageUpdated(stage);
}

function clearFromStage(state, stageKey) {
  const startIndex = STAGE_KEYS.indexOf(stageKey);
  if (startIndex < 0) {
    return;
  }
  for (let i = startIndex; i < STAGE_KEYS.length; i += 1) {
    clearStage(state.stages[STAGE_KEYS[i]]);
  }
  state.finalOutput = null;
}

function clearDownstreamFrom(state, stageKey) {
  const startIndex = STAGE_KEYS.indexOf(stageKey);
  if (startIndex < 0) {
    return;
  }
  for (let i = startIndex + 1; i < STAGE_KEYS.length; i += 1) {
    clearStage(state.stages[STAGE_KEYS[i]]);
  }
  state.finalOutput = null;
}

function makeBatch(stageKey, items, metadata = {}) {
  return {
    id: makeId(stageKey),
    stageKey,
    createdAt: nowIso(),
    archived: false,
    archivedAt: null,
    metadata,
    items
  };
}

function makePromptItems(prompts) {
  return prompts.map((prompt) => ({
    id: makeId("prompt"),
    prompt,
    lifecycle: "active",
    createdAt: nowIso()
  }));
}

function findItem(batch, itemId) {
  return batch.items.find((item) => item.id === itemId) || null;
}

function requireCurrentCut(state) {
  if (!state.currentCut) {
    throw new Error("컷 정보가 없습니다. 먼저 파이프라인을 시작해주세요.");
  }
  return state.currentCut;
}

function selectedPromptFromTu01(state) {
  const stage1 = state.stages.tu01;
  const batch1 = requireActiveBatch(stage1, "TU01");

  if (stage1.selectedItemId) {
    const selected = findItem(batch1, stage1.selectedItemId);
    if (selected) {
      return selected;
    }
  }

  const activeItem = batch1.items.find((item) => item.lifecycle === "active") || batch1.items[0];
  if (!activeItem) {
    throw new Error("TU01 프롬프트가 존재하지 않습니다.");
  }
  return activeItem;
}

function approvedImageFromTu03(state) {
  const stage3 = state.stages.tu03;
  const batch3 = requireActiveBatch(stage3, "TU03");
  let item = null;

  if (stage3.approvedItemId) {
    item = findItem(batch3, stage3.approvedItemId);
  }

  if (!item) {
    item = batch3.items[0] || null;
  }

  if (!item) {
    throw new Error("TU03 고화질 이미지가 없습니다.");
  }

  return item;
}

function selectedPreviewVideoFromTu05(state) {
  const stage5 = state.stages.tu05;
  const batch5 = requireActiveBatch(stage5, "TU05");

  let selected = null;
  if (stage5.selectedItemId) {
    selected = findItem(batch5, stage5.selectedItemId);
  }
  if (!selected) {
    selected = batch5.items[0] || null;
  }

  if (!selected) {
    throw new Error("TU05 선택 영상이 없습니다.");
  }

  return {
    selected,
    batch: batch5
  };
}

async function generateTu01(state, settings) {
  const cut = requireCurrentCut(state);
  const stage1 = state.stages.tu01;
  stage1.status = "생성 중";
  setStageUpdated(stage1);

  const prompts = await makeImagePrompts({
    cutDescription: cut.description,
    cutPurpose: cut.purpose,
    count: 3,
    settings
  });

  if (!prompts.length) {
    throw new Error("TU01에서 프롬프트 생성 결과가 없습니다.");
  }

  const batch = makeBatch("tu01", makePromptItems(prompts), {
    cutId: cut.id
  });

  activateBatch(stage1, batch);
  stage1.status = "유저 응답 대기 중";
  setStageUpdated(stage1);

  return batch;
}

async function generateTu02(state, settings) {
  const stage1 = state.stages.tu01;
  const stage2 = state.stages.tu02;

  const promptBatch = requireActiveBatch(stage1, "TU01");
  stage2.status = "생성 중";
  setStageUpdated(stage2);

  const generated = await Promise.all(
    promptBatch.items.map(async (promptItem) => {
      const image = await renderImage({
        prompt: promptItem.prompt,
        quality: "low",
        settings
      });

      return {
        id: makeId("img_lq"),
        prompt: promptItem.prompt,
        sourcePromptItemId: promptItem.id,
        url: image.url,
        provider: image.provider,
        lifecycle: "active",
        createdAt: nowIso()
      };
    })
  );

  const batch = makeBatch("tu02", generated, {
    sourcePromptBatchId: promptBatch.id
  });

  activateBatch(stage2, batch);
  stage2.status = "유저 응답 대기 중";
  setStageUpdated(stage2);

  return batch;
}

async function generateTu03FromPrompt(state, settings, promptItem) {
  const stage3 = state.stages.tu03;
  stage3.status = "생성 중";
  setStageUpdated(stage3);

  const image = await renderImage({
    prompt: promptItem.prompt,
    quality: "high",
    settings
  });

  const item = {
    id: makeId("img_hq"),
    prompt: promptItem.prompt,
    sourcePromptItemId: promptItem.id,
    url: image.url,
    provider: image.provider,
    lifecycle: "active",
    createdAt: nowIso()
  };

  const batch = makeBatch("tu03", [item], {
    sourcePromptItemId: promptItem.id
  });

  activateBatch(stage3, batch);
  stage3.selectedItemId = item.id;
  stage3.status = "승인/재생성 대기";
  setStageUpdated(stage3);
  return batch;
}

async function generateTu04(state, settings, approvedImage) {
  const stage4 = state.stages.tu04;
  const cut = requireCurrentCut(state);

  stage4.status = "생성 중";
  setStageUpdated(stage4);

  const prompts = await makeVideoPrompts({
    cutDescription: cut.description,
    cutPurpose: cut.purpose,
    baseImageUrl: approvedImage.url,
    count: 3,
    settings
  });

  if (!prompts.length) {
    throw new Error("TU04에서 영상 프롬프트 생성 결과가 없습니다.");
  }

  const batch = makeBatch("tu04", makePromptItems(prompts), {
    baseImageUrl: approvedImage.url,
    sourceImageItemId: approvedImage.id
  });

  activateBatch(stage4, batch);
  stage4.status = "유저 응답 대기 중";
  setStageUpdated(stage4);
  return batch;
}

async function generateTu05(state, settings) {
  const stage4 = state.stages.tu04;
  const stage5 = state.stages.tu05;
  const batch4 = requireActiveBatch(stage4, "TU04");

  stage5.status = "생성 중";
  setStageUpdated(stage5);

  const baseImageUrl = batch4.metadata.baseImageUrl || "";
  const videos = await Promise.all(
    batch4.items.map(async (promptItem) => {
      const video = await renderVideo({
        prompt: promptItem.prompt,
        baseImageUrl,
        quality: "low",
        settings
      });

      return {
        id: makeId("vid_lq"),
        prompt: promptItem.prompt,
        sourcePromptItemId: promptItem.id,
        url: video.url,
        provider: video.provider,
        lifecycle: "active",
        createdAt: nowIso()
      };
    })
  );

  const batch = makeBatch("tu05", videos, {
    sourcePromptBatchId: batch4.id,
    baseImageUrl
  });

  activateBatch(stage5, batch);
  stage5.status = "유저 응답 대기 중";
  setStageUpdated(stage5);
  return batch;
}

async function generateTu06(state, settings, selectedPreview) {
  const stage5 = state.stages.tu05;
  const stage6 = state.stages.tu06;
  const batch5 = requireActiveBatch(stage5, "TU05");

  stage6.status = "생성 중";
  setStageUpdated(stage6);

  const baseImageUrl = batch5.metadata.baseImageUrl || "";
  const rendered = await renderVideo({
    prompt: selectedPreview.prompt,
    baseImageUrl,
    quality: "high",
    settings
  });

  const item = {
    id: makeId("vid_hq"),
    prompt: selectedPreview.prompt,
    sourcePreviewVideoItemId: selectedPreview.id,
    sourcePromptItemId: selectedPreview.sourcePromptItemId,
    url: rendered.url,
    provider: rendered.provider,
    lifecycle: "active",
    createdAt: nowIso()
  };

  const batch = makeBatch("tu06", [item], {
    sourcePreviewBatchId: batch5.id,
    baseImageUrl
  });

  activateBatch(stage6, batch);
  stage6.selectedItemId = item.id;
  stage6.status = "승인/재생성 대기";
  setStageUpdated(stage6);
  return batch;
}

function markSelectedInBatch(batch, itemId) {
  for (const item of batch.items) {
    item.lifecycle = item.id === itemId ? "active" : "inactive/archived";
  }
}

export async function resetPipeline() {
  return mutateStore(async (state) => {
    const next = createInitialState();
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, next);
    return getStateSnapshot();
  });
}

export async function startPipeline({ cutDescription, cutPurpose }) {
  if (!cutDescription || !cutDescription.trim()) {
    throw new Error("컷 설명은 필수입니다.");
  }

  return mutateStore(async (state, settings) => {
    const next = createInitialState();
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, next);

    state.pipelineStatus = "running";
    state.currentCut = {
      id: makeId("cut"),
      description: cutDescription.trim(),
      purpose: (cutPurpose || "").trim(),
      createdAt: nowIso()
    };

    await generateTu01(state, settings);
    await generateTu02(state, settings);

    return getStateSnapshot();
  });
}

export async function regenerateTu01AndTu02() {
  return mutateStore(async (state, settings) => {
    requireCurrentCut(state);
    clearFromStage(state, "tu01");
    await generateTu01(state, settings);
    await generateTu02(state, settings);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function regenerateTu02() {
  return mutateStore(async (state, settings) => {
    requireCurrentCut(state);
    clearFromStage(state, "tu02");
    await generateTu02(state, settings);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function selectTu02Item({ itemId }) {
  if (!itemId) {
    throw new Error("선택할 TU02 itemId가 필요합니다.");
  }

  return mutateStore(async (state, settings) => {
    const stage1 = state.stages.tu01;
    const stage2 = state.stages.tu02;
    const batch2 = requireActiveBatch(stage2, "TU02");
    const selectedPreview = findItem(batch2, itemId);

    if (!selectedPreview) {
      throw new Error("선택한 TU02 항목을 찾을 수 없습니다.");
    }

    stage2.selectedItemId = selectedPreview.id;
    markSelectedInBatch(batch2, selectedPreview.id);
    stage2.status = "완료";
    setStageUpdated(stage2);

    const batch1 = requireActiveBatch(stage1, "TU01");
    const sourcePrompt = findItem(batch1, selectedPreview.sourcePromptItemId);
    if (!sourcePrompt) {
      throw new Error("TU02 선택 결과와 매칭되는 TU01 프롬프트를 찾을 수 없습니다.");
    }

    stage1.selectedItemId = sourcePrompt.id;
    markSelectedInBatch(batch1, sourcePrompt.id);
    stage1.status = "완료";
    setStageUpdated(stage1);

    clearFromStage(state, "tu03");
    await generateTu03FromPrompt(state, settings, sourcePrompt);

    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function regenerateTu03() {
  return mutateStore(async (state, settings) => {
    const prompt = selectedPromptFromTu01(state);
    clearDownstreamFrom(state, "tu03");
    await generateTu03FromPrompt(state, settings, prompt);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function approveTu03() {
  return mutateStore(async (state, settings) => {
    const stage3 = state.stages.tu03;
    const batch3 = requireActiveBatch(stage3, "TU03");
    const approvedImage = batch3.items[0];

    if (!approvedImage) {
      throw new Error("TU03 승인할 이미지가 없습니다.");
    }

    stage3.approvedItemId = approvedImage.id;
    stage3.status = "완료";
    setStageUpdated(stage3);

    clearFromStage(state, "tu04");
    await generateTu04(state, settings, approvedImage);
    await generateTu05(state, settings);

    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function regenerateTu04AndTu05() {
  return mutateStore(async (state, settings) => {
    const approvedImage = approvedImageFromTu03(state);
    clearFromStage(state, "tu04");
    await generateTu04(state, settings, approvedImage);
    await generateTu05(state, settings);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function regenerateTu05() {
  return mutateStore(async (state, settings) => {
    clearFromStage(state, "tu05");
    await generateTu05(state, settings);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function selectTu05Item({ itemId }) {
  if (!itemId) {
    throw new Error("선택할 TU05 itemId가 필요합니다.");
  }

  return mutateStore(async (state, settings) => {
    const stage4 = state.stages.tu04;
    const stage5 = state.stages.tu05;

    const batch5 = requireActiveBatch(stage5, "TU05");
    const selectedPreview = findItem(batch5, itemId);
    if (!selectedPreview) {
      throw new Error("선택한 TU05 항목을 찾을 수 없습니다.");
    }

    stage5.selectedItemId = selectedPreview.id;
    markSelectedInBatch(batch5, selectedPreview.id);
    stage5.status = "완료";
    setStageUpdated(stage5);

    const batch4 = requireActiveBatch(stage4, "TU04");
    const sourcePrompt = findItem(batch4, selectedPreview.sourcePromptItemId);
    if (!sourcePrompt) {
      throw new Error("TU05 선택 결과와 매칭되는 TU04 프롬프트를 찾을 수 없습니다.");
    }

    stage4.selectedItemId = sourcePrompt.id;
    markSelectedInBatch(batch4, sourcePrompt.id);
    stage4.status = "완료";
    setStageUpdated(stage4);

    clearFromStage(state, "tu06");
    await generateTu06(state, settings, selectedPreview);

    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function regenerateTu06() {
  return mutateStore(async (state, settings) => {
    const { selected } = selectedPreviewVideoFromTu05(state);
    await generateTu06(state, settings, selected);
    state.pipelineStatus = "running";
    return getStateSnapshot();
  });
}

export async function approveTu06() {
  return mutateStore(async (state) => {
    const stage6 = state.stages.tu06;
    const batch6 = requireActiveBatch(stage6, "TU06");
    const item = batch6.items[0];

    if (!item) {
      throw new Error("TU06 승인할 영상이 없습니다.");
    }

    stage6.approvedItemId = item.id;
    stage6.status = "완료";
    setStageUpdated(stage6);

    state.finalOutput = {
      videoUrl: item.url,
      prompt: item.prompt,
      approvedAt: nowIso(),
      sourceHighVideoItemId: item.id
    };

    state.pipelineStatus = "complete";
    return getStateSnapshot();
  });
}

export function buildStateBundle() {
  return {
    state: getStateSnapshot(),
    settings: getSettingsSnapshot()
  };
}

export function getFreshEmptyStage() {
  return createEmptyStage();
}
