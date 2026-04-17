const stateEls = {
  pipelineStatus: document.getElementById("pipelineStatus"),
  toast: document.getElementById("toast"),
  tu01Card: document.getElementById("tu01Card"),
  tu02Card: document.getElementById("tu02Card"),
  tu03Card: document.getElementById("tu03Card"),
  tu04Card: document.getElementById("tu04Card"),
  tu05Card: document.getElementById("tu05Card"),
  tu06Card: document.getElementById("tu06Card"),
  finalOutputCard: document.getElementById("finalOutputCard")
};

const formEls = {
  cutDescription: document.getElementById("cutDescription"),
  cutPurpose: document.getElementById("cutPurpose"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  llmProvider: document.getElementById("llmProvider"),
  llmModel: document.getElementById("llmModel"),
  llmEndpoint: document.getElementById("llmEndpoint"),
  llmKeyHeader: document.getElementById("llmKeyHeader"),
  llmApiKey: document.getElementById("llmApiKey"),
  llmKeyHint: document.getElementById("llmKeyHint"),
  imageProvider: document.getElementById("imageProvider"),
  imageModel: document.getElementById("imageModel"),
  imageEndpointLow: document.getElementById("imageEndpointLow"),
  imageEndpointHigh: document.getElementById("imageEndpointHigh"),
  imageKeyHeader: document.getElementById("imageKeyHeader"),
  imageApiKey: document.getElementById("imageApiKey"),
  imageKeyHint: document.getElementById("imageKeyHint"),
  videoProvider: document.getElementById("videoProvider"),
  videoModel: document.getElementById("videoModel"),
  videoEndpointLow: document.getElementById("videoEndpointLow"),
  videoEndpointHigh: document.getElementById("videoEndpointHigh"),
  videoKeyHeader: document.getElementById("videoKeyHeader"),
  videoApiKey: document.getElementById("videoApiKey"),
  videoKeyHint: document.getElementById("videoKeyHint")
};

const clearKeyFlags = {
  llm: false,
  image: false,
  video: false
};

let bundle = null;
let busy = false;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setBusy(nextBusy) {
  busy = nextBusy;
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = nextBusy;
  });
}

function showToast(message) {
  stateEls.toast.textContent = message;
  stateEls.toast.classList.remove("hidden");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    stateEls.toast.classList.add("hidden");
  }, 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `요청 실패: ${response.status}`);
  }
  return data;
}

function activeBatch(stage) {
  if (!stage || !stage.activeBatchId) {
    return null;
  }
  return stage.batches.find((batch) => batch.id === stage.activeBatchId) || null;
}

function archivedCount(stage) {
  if (!stage || !Array.isArray(stage.batches)) {
    return 0;
  }
  return stage.batches.filter((batch) => batch.archived).length;
}

function archiveBlock(stage) {
  const archived = (stage?.batches || []).filter((batch) => batch.archived);
  if (!archived.length) {
    return "";
  }

  const lines = archived
    .slice(0, 6)
    .map((batch) => `<li>${escapeHtml(batch.id)} · ${escapeHtml(batch.createdAt)} · item ${batch.items.length}</li>`)
    .join("");

  return `
    <details class="archive">
      <summary>Archived 이력 ${archived.length}개</summary>
      <ul class="archive-list">${lines}</ul>
    </details>
  `;
}

function statusLabel(stage) {
  return stage?.status || "대기";
}

function renderTu01(stage) {
  const batch = activeBatch(stage);
  const promptCount = batch ? batch.items.length : 0;
  const selected = stage?.selectedItemId || "없음";

  stateEls.tu01Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU01 이미지 프롬프트 작성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn ghost" data-action="tu01-regenerate">프롬프트 재생성 (TU01+TU02)</button>
    </div>
    <div class="empty">
      생성 프롬프트는 직접 노출하지 않고 TU02 미리보기로 연결됩니다.<br />
      현재 배치 프롬프트 수: <strong>${promptCount}</strong> / 선택 프롬프트 ID: <strong>${escapeHtml(selected)}</strong>
    </div>
    ${archiveBlock(stage)}
  `;
}

function renderImageCards(items, selectedItemId, actionName) {
  return items
    .map((item) => {
      const selected = selectedItemId === item.id;
      return `
        <article class="media-card">
          <img src="${escapeHtml(item.url)}" alt="generated preview" loading="lazy" />
          <div class="meta">
            <p class="prompt">${escapeHtml(item.prompt)}</p>
            <button class="btn ${selected ? "ok" : "ghost"}" data-action="${actionName}" data-item-id="${escapeHtml(item.id)}">
              ${selected ? "선택됨" : "이 결과 선택"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderVideoCards(items, selectedItemId, actionName) {
  return items
    .map((item) => {
      const selected = selectedItemId === item.id;
      return `
        <article class="media-card">
          <video src="${escapeHtml(item.url)}" controls muted playsinline preload="metadata"></video>
          <div class="meta">
            <p class="prompt">${escapeHtml(item.prompt)}</p>
            <button class="btn ${selected ? "ok" : "ghost"}" data-action="${actionName}" data-item-id="${escapeHtml(item.id)}">
              ${selected ? "선택됨" : "이 영상 선택"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTu02(stage) {
  const batch = activeBatch(stage);
  stateEls.tu02Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU02 저화질 이미지 생성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn warn" data-action="tu02-regenerate">저화질 이미지 재생성</button>
    </div>
    ${
      batch
        ? `<div class="gallery">${renderImageCards(batch.items, stage.selectedItemId, "tu02-select")}</div>`
        : `<div class="empty">TU01 완료 후 저화질 프리뷰 3개가 표시됩니다.</div>`
    }
    ${archiveBlock(stage)}
  `;
}

function renderTu03(stage) {
  const batch = activeBatch(stage);
  const item = batch?.items?.[0];

  stateEls.tu03Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU03 고화질 이미지 생성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn warn" data-action="tu03-regenerate">고화질 이미지 재생성</button>
      <button class="btn ok" data-action="tu03-approve">고화질 이미지 승인</button>
    </div>
    ${
      item
        ? `<article class="media-card"><img src="${escapeHtml(item.url)}" alt="hq image" /><div class="meta"><p class="prompt">${escapeHtml(item.prompt)}</p></div></article>`
        : `<div class="empty">TU02에서 1개를 선택하면 고화질 이미지가 생성됩니다.</div>`
    }
    ${archiveBlock(stage)}
  `;
}

function renderTu04(stage) {
  const batch = activeBatch(stage);

  const promptList = batch
    ? `<div class="empty">${batch.items
        .map((item, index) => `${index + 1}. ${escapeHtml(item.prompt)}`)
        .join("<br />")}</div>`
    : `<div class="empty">TU03 승인 시 영상화 프롬프트 3개가 생성됩니다.</div>`;

  stateEls.tu04Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU04 영상화 프롬프트 작성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn ghost" data-action="tu04-regenerate">영상화 프롬프트 재생성 (TU04+TU05)</button>
    </div>
    ${promptList}
    ${archiveBlock(stage)}
  `;
}

function renderTu05(stage) {
  const batch = activeBatch(stage);

  stateEls.tu05Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU05 저화질 영상 생성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn warn" data-action="tu05-regenerate">저화질 영상 재생성</button>
    </div>
    ${
      batch
        ? `<div class="gallery">${renderVideoCards(batch.items, stage.selectedItemId, "tu05-select")}</div>`
        : `<div class="empty">TU04 완료 후 저화질 영상 3개가 표시됩니다.</div>`
    }
    ${archiveBlock(stage)}
  `;
}

function renderTu06(stage) {
  const batch = activeBatch(stage);
  const item = batch?.items?.[0];

  stateEls.tu06Card.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">TU06 고화질 영상 생성</h3>
      <span class="stage-status">${escapeHtml(statusLabel(stage))}</span>
    </div>
    <div class="stage-actions">
      <button class="btn warn" data-action="tu06-regenerate">고화질 영상 재생성</button>
      <button class="btn ok" data-action="tu06-approve">최종 승인</button>
    </div>
    ${
      item
        ? `<article class="media-card"><video src="${escapeHtml(item.url)}" controls muted playsinline preload="metadata"></video><div class="meta"><p class="prompt">${escapeHtml(item.prompt)}</p></div></article>`
        : `<div class="empty">TU05에서 영상을 선택하면 고화질 렌더링이 시작됩니다.</div>`
    }
    ${archiveBlock(stage)}
  `;
}

function renderFinalOutput(state) {
  const output = state.finalOutput;
  stateEls.finalOutputCard.innerHTML = `
    <div class="stage-head">
      <h3 class="stage-title">최종 출력</h3>
      <span class="stage-status">${escapeHtml(state.pipelineStatus)}</span>
    </div>
    ${
      output
        ? `<div class="result"><video src="${escapeHtml(output.videoUrl)}" controls playsinline preload="metadata"></video><p class="prompt">${escapeHtml(
            output.prompt
          )}</p><p class="hint">승인 시각: ${escapeHtml(output.approvedAt)}</p></div>`
        : `<div class="empty">TU06 승인 후 최종 고화질 영상이 여기에 표시됩니다.</div>`
    }
  `;
}

function applySettingsToForm(settings) {
  formEls.llmProvider.value = settings.llm.provider;
  formEls.llmModel.value = settings.llm.model || "";
  formEls.llmEndpoint.value = settings.llm.endpoint || "";
  formEls.llmKeyHeader.value = settings.llm.keyHeader || "Authorization";
  formEls.llmKeyHint.textContent = settings.llm.hasApiKey
    ? `저장된 키: ${settings.llm.apiKeyMasked}`
    : "저장된 키 없음";

  formEls.imageProvider.value = settings.image.provider;
  formEls.imageModel.value = settings.image.model || "";
  formEls.imageEndpointLow.value = settings.image.endpointLow || "";
  formEls.imageEndpointHigh.value = settings.image.endpointHigh || "";
  formEls.imageKeyHeader.value = settings.image.keyHeader || "Authorization";
  formEls.imageKeyHint.textContent = settings.image.hasApiKey
    ? `저장된 키: ${settings.image.apiKeyMasked}`
    : "저장된 키 없음";

  formEls.videoProvider.value = settings.video.provider;
  formEls.videoModel.value = settings.video.model || "";
  formEls.videoEndpointLow.value = settings.video.endpointLow || "";
  formEls.videoEndpointHigh.value = settings.video.endpointHigh || "";
  formEls.videoKeyHeader.value = settings.video.keyHeader || "Authorization";
  formEls.videoKeyHint.textContent = settings.video.hasApiKey
    ? `저장된 키: ${settings.video.apiKeyMasked}`
    : "저장된 키 없음";
}

function render(bundleData) {
  bundle = bundleData;
  const { state, settings } = bundleData;

  stateEls.pipelineStatus.textContent = `${state.pipelineStatus} / TU01:${state.stages.tu01.status} / TU06:${state.stages.tu06.status}`;

  renderTu01(state.stages.tu01);
  renderTu02(state.stages.tu02);
  renderTu03(state.stages.tu03);
  renderTu04(state.stages.tu04);
  renderTu05(state.stages.tu05);
  renderTu06(state.stages.tu06);
  renderFinalOutput(state);

  applySettingsToForm(settings);
}

function settingsPayloadFromForm() {
  const payload = {
    llm: {
      provider: formEls.llmProvider.value,
      model: formEls.llmModel.value,
      endpoint: formEls.llmEndpoint.value,
      keyHeader: formEls.llmKeyHeader.value
    },
    image: {
      provider: formEls.imageProvider.value,
      model: formEls.imageModel.value,
      endpointLow: formEls.imageEndpointLow.value,
      endpointHigh: formEls.imageEndpointHigh.value,
      keyHeader: formEls.imageKeyHeader.value
    },
    video: {
      provider: formEls.videoProvider.value,
      model: formEls.videoModel.value,
      endpointLow: formEls.videoEndpointLow.value,
      endpointHigh: formEls.videoEndpointHigh.value,
      keyHeader: formEls.videoKeyHeader.value
    }
  };

  if (formEls.llmApiKey.value.trim()) {
    payload.llm.apiKey = formEls.llmApiKey.value.trim();
  }
  if (formEls.imageApiKey.value.trim()) {
    payload.image.apiKey = formEls.imageApiKey.value.trim();
  }
  if (formEls.videoApiKey.value.trim()) {
    payload.video.apiKey = formEls.videoApiKey.value.trim();
  }

  if (clearKeyFlags.llm) {
    payload.llm.clearApiKey = true;
  }
  if (clearKeyFlags.image) {
    payload.image.clearApiKey = true;
  }
  if (clearKeyFlags.video) {
    payload.video.clearApiKey = true;
  }

  return payload;
}

function resetClearKeyFlags() {
  clearKeyFlags.llm = false;
  clearKeyFlags.image = false;
  clearKeyFlags.video = false;
}

async function runRequest(path, body = null) {
  setBusy(true);
  try {
    const data = await api(path, {
      method: "POST",
      body
    });
    render(data);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function refresh() {
  setBusy(true);
  try {
    const data = await api("/api/state");
    render(data);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

formEls.startBtn.addEventListener("click", async () => {
  const cutDescription = formEls.cutDescription.value.trim();
  const cutPurpose = formEls.cutPurpose.value.trim();

  if (!cutDescription) {
    showToast("컷 설명을 입력해주세요.");
    return;
  }

  await runRequest("/api/pipeline/start", {
    cutDescription,
    cutPurpose
  });
});

formEls.resetBtn.addEventListener("click", async () => {
  await runRequest("/api/pipeline/reset");
});

formEls.saveSettingsBtn.addEventListener("click", async () => {
  const payload = settingsPayloadFromForm();
  await runRequest("/api/settings", payload);
  formEls.llmApiKey.value = "";
  formEls.imageApiKey.value = "";
  formEls.videoApiKey.value = "";
  resetClearKeyFlags();
  showToast("설정이 저장되었습니다.");
});

document.body.addEventListener("click", async (event) => {
  const clearBtn = event.target.closest("button[data-clear-key]");
  if (clearBtn) {
    const key = clearBtn.dataset.clearKey;
    if (key && key in clearKeyFlags) {
      clearKeyFlags[key] = true;
      showToast(`${key.toUpperCase()} 키 삭제 예약됨 (저장 버튼을 누르세요).`);
    }
    return;
  }

  const actionBtn = event.target.closest("button[data-action]");
  if (!actionBtn) {
    return;
  }

  const action = actionBtn.dataset.action;
  const itemId = actionBtn.dataset.itemId;

  switch (action) {
    case "tu01-regenerate":
      await runRequest("/api/tu01/regenerate");
      break;
    case "tu02-regenerate":
      await runRequest("/api/tu02/regenerate");
      break;
    case "tu02-select":
      await runRequest("/api/tu02/select", { itemId });
      break;
    case "tu03-regenerate":
      await runRequest("/api/tu03/regenerate");
      break;
    case "tu03-approve":
      await runRequest("/api/tu03/approve");
      break;
    case "tu04-regenerate":
      await runRequest("/api/tu04/regenerate");
      break;
    case "tu05-regenerate":
      await runRequest("/api/tu05/regenerate");
      break;
    case "tu05-select":
      await runRequest("/api/tu05/select", { itemId });
      break;
    case "tu06-regenerate":
      await runRequest("/api/tu06/regenerate");
      break;
    case "tu06-approve":
      await runRequest("/api/tu06/approve");
      break;
    default:
      break;
  }
});

refresh();
