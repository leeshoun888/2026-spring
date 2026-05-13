"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisRun, DashboardData, Sentiment, Settings, SourceType, VocRecord } from "@/lib/types";

type SettingsResponse = Settings & {
  hasNaver?: boolean;
  hasYoutube?: boolean;
  hasOpenAI?: boolean;
};

const SOURCE_LABELS: Record<SourceType, string> = {
  naver_blog: "네이버 블로그",
  naver_news: "네이버 뉴스",
  naver_cafe: "네이버 카페",
  youtube: "YouTube",
  smartstore_review: "스마트스토어 리뷰"
};

const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정"
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<SettingsResponse>({});
  const [activeTab, setActiveTab] = useState("overview");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [productName, setProductName] = useState("매일 바이오 그릭요거트");
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [trashedRuns, setTrashedRuns] = useState<AnalysisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [isNewProject, setIsNewProject] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isUploadingReviews, setIsUploadingReviews] = useState(false);
  const [isUploadDragActive, setIsUploadDragActive] = useState(false);
  const reviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("API 키를 입력하거나 환경변수를 설정한 뒤 초경량 분석을 실행하세요.");

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshAll(runId = selectedRunId, options: { keepNewProject?: boolean } = {}) {
    const dataUrl = runId ? `/api/data?runId=${encodeURIComponent(runId)}` : "/api/data";
    const [settingsRes, dataRes, runsRes] = await Promise.all([fetch("/api/settings"), fetch(dataUrl), fetch("/api/runs")]);
    const nextData = await dataRes.json();
    const runsPayload = await runsRes.json();
    const nextRuns = (runsPayload.runs || []) as AnalysisRun[];
    const nextTrashedRuns = (runsPayload.trashedRuns || []) as AnalysisRun[];
    setSettings(await settingsRes.json());
    setData(nextData);
    setRuns(nextRuns);
    setTrashedRuns(nextTrashedRuns);
    if (!runId && nextData.metadata?.selectedRunId && !isNewProject && !options.keepNewProject) {
      setSelectedRunId(nextData.metadata.selectedRunId);
    }
  }

  async function saveSettings(formData: FormData) {
    const payload = {
      naverClientId: String(formData.get("naverClientId") || ""),
      naverClientSecret: String(formData.get("naverClientSecret") || ""),
      youtubeApiKey: String(formData.get("youtubeApiKey") || ""),
      openaiApiKey: String(formData.get("openaiApiKey") || ""),
      openaiModel: String(formData.get("openaiModel") || "gpt-4o-mini"),
      cronSecret: String(formData.get("cronSecret") || "")
    };
    setStatus("설정을 저장하는 중입니다.");
    await fetch("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    await refreshAll();
    setStatus("설정이 저장되었습니다. 연결 테스트 또는 분석 실행을 진행할 수 있습니다.");
  }

  async function testConnections() {
    setStatus("네이버·유튜브 연결을 테스트하는 중입니다.");
    const res = await fetch("/api/settings/test");
    const result = await res.json();
    setStatus([result.naver?.message, result.youtube?.message, result.openai?.message].filter(Boolean).join(" / "));
  }

  async function runAnalysis() {
    setIsRunning(true);
    setStatus("초경량 모드로 공개 데이터를 넓게 수집하고 유효 VOC 1,000건을 목표로 필터링하고 있습니다.");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          productName,
          analysisMode: "ultra",
          naverPerKeyword: 1000,
          youtubeVideosPerKeyword: 50,
          youtubeCommentsPerVideo: 100,
          maxRawItems: 10000,
          targetVocCount: 1000
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "분석 실행에 실패했습니다.");
      setIsNewProject(false);
      setSelectedRunId(result.run.id);
      await refreshAll(result.run.id);
      setStatus(`분석 완료: 공개 데이터 ${result.run.rawCount.toLocaleString()}건 수집, 유효 VOC ${result.run.vocCount.toLocaleString()}건 필터링 완료`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "분석 실행에 실패했습니다.");
    } finally {
      setIsRunning(false);
    }
  }

  async function uploadReviewFile(file?: File | null) {
    if (!file) return;
    setIsUploadingReviews(true);
    setStatus("스마트스토어 리뷰 엑셀을 읽고 구매 리뷰 VOC로 변환하고 있습니다.");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productName", productName);
      const res = await fetch("/api/import/reviews", { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "리뷰 엑셀 업로드에 실패했습니다.");
      setIsNewProject(false);
      setSelectedRunId(result.run.id);
      setSourceFilter("all");
      setActiveTab("voc");
      await refreshAll(result.run.id);
      setStatus(`업로드 완료: 리뷰 ${result.run.rawCount.toLocaleString()}건 중 유효 VOC ${result.run.vocCount.toLocaleString()}건을 반영했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "리뷰 엑셀 업로드에 실패했습니다.");
    } finally {
      setIsUploadingReviews(false);
      setIsUploadDragActive(false);
      if (reviewFileInputRef.current) reviewFileInputRef.current.value = "";
    }
  }

  function startNewProject() {
    setIsNewProject(true);
    setSelectedRunId("");
    setSourceFilter("all");
    setActiveTab("overview");
    setStatus("새 프로젝트입니다. 분석 제품명을 입력한 뒤 실제 데이터 분석을 실행하세요.");
  }

  async function moveProjectToTrash(run: AnalysisRun) {
    if (!window.confirm(`'${run.productName}' 프로젝트를 휴지통으로 이동할까요? 90일 후 영구 삭제됩니다.`)) return;
    await fetch("/api/runs", {
      method: "PATCH",
      body: JSON.stringify({ action: "trash", runId: run.id })
    });
    const isSelectedRun = selectedRunId === run.id;
    if (isSelectedRun) startNewProject();
    await refreshAll(isSelectedRun ? "" : selectedRunId, { keepNewProject: isSelectedRun });
    setStatus("프로젝트가 휴지통으로 이동되었습니다. 90일 이내에 복구할 수 있습니다.");
  }

  async function restoreProject(run: AnalysisRun) {
    await fetch("/api/runs", {
      method: "PATCH",
      body: JSON.stringify({ action: "restore", runId: run.id })
    });
    setIsNewProject(false);
    setSelectedRunId(run.id);
    await refreshAll(run.id);
    setStatus("휴지통에서 프로젝트를 복구했습니다.");
  }

  const dashboardData = isNewProject ? createEmptyDashboard(productName, runs, trashedRuns) : data;

  const records = useMemo(() => {
    const all = dashboardData?.vocRecords || [];
    return sourceFilter === "all" ? all : all.filter((record) => record.source === sourceFilter);
  }, [dashboardData, sourceFilter]);

  const total = dashboardData?.metadata.totalVocCount || 0;
  const sentiment = dashboardData?.aggregation.sentiment || { positive: 0, neutral: 0, negative: 0 };
  const pct = dashboardData?.aggregation.sentimentPct || { positive: 0, neutral: 0, negative: 0 };
  const quality = dashboardData?.aggregation.quality || { firstPersonReviewCount: 0, productRelevantCount: 0, highRiskCount: 0, averageRelevanceScore: 0 };
  const sources = dashboardData?.metadata.sourceBreakdown || { naver_blog: 0, naver_news: 0, naver_cafe: 0, youtube: 0, smartstore_review: 0 };
  const rawSources = dashboardData?.metadata.rawSourceBreakdown || { naver_blog: 0, naver_news: 0, naver_cafe: 0, youtube: 0, smartstore_review: 0 };
  const selectedRun = isNewProject ? undefined : runs.find((run) => run.id === selectedRunId) || dashboardData?.metadata.latestRun;

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand-mark">Maeil</div>
          <div className="app-identity">
            <div className="app-name">
              VOC. <span>고객의 목소리, 매일.</span>
            </div>
          </div>
          <div className="live-pill">
            <span className="live-dot" />
            {isRunning ? "분석 중" : "Ready"}
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-eyebrow">VOC Intelligence</div>
          <h1 className="hero-title">
            고객의 모든 목소리를
            <br />
            <em>매일</em> 듣습니다.
          </h1>
          <p className="hero-subtitle">네이버와 유튜브 공개 데이터를 대량 수집하고, 비용 최적화 분석 엔진으로 VOC를 분류·리스크화합니다.</p>
        </section>

        <section className="workspace-shell">
          <aside className="project-sidebar">
            <div className="project-sidebar-head">
              <span>분석 프로젝트</span>
              <strong>{runs.length}</strong>
            </div>
            <button className={`new-project-button ${isNewProject ? "active" : ""}`} onClick={startNewProject}>
              <span>새 프로젝트</span>
              <em>빈 대시보드에서 시작</em>
            </button>
            <div className="project-list">
              {runs.length ? (
                runs.map((run) => (
                  <ProjectButton
                    key={run.id}
                    run={run}
                    active={run.id === selectedRunId}
                    onOpen={() => {
                      setIsNewProject(false);
                      setSelectedRunId(run.id);
                      refreshAll(run.id);
                      setSourceFilter("all");
                    }}
                    onTrash={() => moveProjectToTrash(run)}
                  />
                ))
              ) : (
                <div className="empty-projects">아직 저장된 분석 프로젝트가 없습니다.</div>
              )}
            </div>
            <div className="trash-section">
              <div className="project-sidebar-head">
                <span>휴지통</span>
                <strong>{trashedRuns.length}</strong>
              </div>
              <div className="project-list">
                {trashedRuns.length ? (
                  trashedRuns.map((run) => (
                    <TrashProjectButton key={run.id} run={run} onRestore={() => restoreProject(run)} />
                  ))
                ) : (
                  <div className="empty-projects">휴지통이 비어 있습니다.</div>
                )}
              </div>
            </div>
          </aside>

          <div className="workspace-main">
        <section className="control-band">
          <div className="control-main">
            <label className="field-label" htmlFor="productName">
              분석 제품
            </label>
            <input id="productName" className="text-input" value={productName} onChange={(e) => setProductName(e.target.value)} />
            <p className="product-note">입력한 제품명 하나로 네이버와 유튜브 공개 데이터를 최대 10,000건 조사합니다.</p>
            <button className="btn-primary" onClick={runAnalysis} disabled={isRunning}>
              {isRunning ? "수집·분석 중..." : "실제 데이터 분석 실행"}
            </button>
            <div
              className={`review-dropzone ${isUploadDragActive ? "active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsUploadDragActive(true);
              }}
              onDragLeave={() => setIsUploadDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                uploadReviewFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={reviewFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => uploadReviewFile(event.target.files?.[0])}
              />
              <span>스마트스토어 리뷰 엑셀 업로드</span>
              <strong>{isUploadingReviews ? "업로드·분석 중..." : "파일을 끌어오거나 클릭해서 선택"}</strong>
              <em>판매자센터에서 내려받은 구매 리뷰 파일을 새 프로젝트로 분석합니다.</em>
              <button type="button" className="btn-secondary" onClick={() => reviewFileInputRef.current?.click()} disabled={isUploadingReviews}>
                파일 선택
              </button>
            </div>
            <p className="status-line">{status}</p>
          </div>

          <form action={saveSettings} className="settings-card">
            <div className="settings-head">
              <div>
                <h2>API 설정</h2>
                <p>{isSettingsOpen ? "환경변수 또는 이 화면에 입력한 키를 사용합니다." : "필요할 때만 열어서 키를 관리합니다."}</p>
              </div>
              <div className="settings-actions">
                {isSettingsOpen && (
                  <button type="button" className="btn-secondary" onClick={testConnections}>
                    연결 테스트
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={() => setIsSettingsOpen((open) => !open)}>
                  {isSettingsOpen ? "API 설정 닫기" : "API 설정 열기"}
                </button>
              </div>
            </div>
            {isSettingsOpen && (
              <>
                <div className="settings-grid">
                  <CredentialField name="naverClientId" label="Naver Client ID" placeholder={settings.naverClientId || ""} />
                  <CredentialField name="naverClientSecret" label="Naver Client Secret" placeholder={settings.naverClientSecret || ""} />
                  <CredentialField name="youtubeApiKey" label="YouTube API Key" placeholder={settings.youtubeApiKey || ""} />
                  <CredentialField name="openaiApiKey" label="OpenAI API Key" placeholder={settings.openaiApiKey || ""} />
                  <CredentialField name="openaiModel" label="OpenAI Model" placeholder={settings.openaiModel || "gpt-4o-mini"} defaultValue={settings.openaiModel || "gpt-4o-mini"} />
                  <CredentialField name="cronSecret" label="Cron Secret" placeholder={settings.cronSecret || ""} />
                </div>
                <div className="settings-state">
                  <ConnectionPill active={settings.hasNaver} label="Naver" />
                  <ConnectionPill active={settings.hasYoutube} label="YouTube" />
                  <ConnectionPill active={settings.hasOpenAI} label="OpenAI" />
                  <button className="btn-save">저장</button>
                </div>
              </>
            )}
          </form>
        </section>

        <section className="results-shell">
          <div className="project-context">
            <span>현재 선택</span>
            <strong>{selectedRun?.productName || "새 분석 대기"}</strong>
            <em>{selectedRun ? formatRunDate(selectedRun.startedAt) : "분석을 실행하면 프로젝트가 생성됩니다."}</em>
          </div>
          <div className="exec-strip">
            <Metric label="총 조사" value={total.toLocaleString()} unit="건" />
            <Metric label="긍정 비율" value={`${pct.positive}`} unit="%" />
            <Metric label="부정 비율" value={`${pct.negative}`} unit="%" />
            <Metric label="1인칭 리뷰" value={quality.firstPersonReviewCount.toLocaleString()} unit="건" />
          </div>

          <nav className="tabs">
            {[
              ["overview", "대시보드"],
              ["voc", "VOC 인사이트"],
              ["channels", "채널"],
              ["report", "리포트"],
              ["asset", "데이터 자산"]
            ].map(([id, label]) => (
              <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
                {label}
              </button>
            ))}
          </nav>

          {activeTab === "overview" && (
            <div className="panel">
              <div className="anomaly-card">
                <div className="anomaly-pulse" />
                <div>
                  <span className="anomaly-tag">이상 감지 후보</span>
                  <h2>{topNegativeKeyword(dashboardData) || "분석 데이터가 쌓이면 급증 이슈를 감지합니다."}</h2>
                  <p>부정 VOC와 고위험 키워드를 기준으로 품질·가격·유통 리스크를 매일 추적합니다.</p>
                </div>
              </div>

              <div className="two-col">
                <Section title="14일 감정 추이" number="01">
                  <TrendChart data={dashboardData?.aggregation.trend || []} />
                </Section>
                <Section title="채널 분포" number="02">
                  <SourceBars sources={rawSources} />
                </Section>
              </div>

              <div className="two-col">
                <InsightList title="주요 불만" number="03" items={dashboardData?.insights.pain || []} />
                <InsightList title="주요 강점" number="04" items={dashboardData?.insights.strength || []} />
              </div>
            </div>
          )}

          {activeTab === "voc" && (
            <div className="panel">
              <Section title="감성 분포" number="01">
                <SentimentBar sentiment={sentiment} pct={pct} />
              </Section>
              <Section title="검증 품질" number="02">
                <QualityGrid quality={quality} latestStatus={dashboardData?.metadata.latestRun?.status === "completed" ? "완료" : dashboardData?.metadata.latestRun?.status || "대기"} />
              </Section>
              <div className="two-col">
                <InsightList title="기회 요소" number="03" items={dashboardData?.insights.opportunity || []} />
                <InsightList title="리스크" number="04" items={dashboardData?.insights.risk || []} />
              </div>
              <Section title="핵심 키워드" number="05">
                <div className="keyword-cloud">
                  {(dashboardData?.aggregation.keywords || []).map((item) => (
                    <span key={item.kw} className={`keyword ${item.sent}`}>
                      {item.kw} <b>{item.count}</b>
                    </span>
                  ))}
                </div>
              </Section>
              <Section title="VOC 발화" number="06">
                <div className="filters">
                  <FilterButton label="전체" active={sourceFilter === "all"} onClick={() => setSourceFilter("all")} count={dashboardData?.vocRecords.length || 0} />
                  {(Object.keys(SOURCE_LABELS) as SourceType[]).map((source) => (
                    <FilterButton
                      key={source}
                      label={SOURCE_LABELS[source]}
                      active={sourceFilter === source}
                      onClick={() => setSourceFilter(source)}
                      count={sources[source] || 0}
                    />
                  ))}
                </div>
                <div className="voc-list">
                  {records.length ? (
                    records.map((record) => (
                      <VocCard key={record.id} record={record} />
                    ))
                  ) : (
                    <div className="empty-state">
                      {sourceFilter === "all"
                        ? "표시할 VOC 발화가 아직 없습니다."
                        : `${SOURCE_LABELS[sourceFilter]}에서 VOC로 분류된 발화가 없습니다.`}
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}

          {activeTab === "channels" && (
            <div className="panel">
              <Section title="연동 채널" number="01">
                <div className="channel-grid">
                  {(Object.keys(SOURCE_LABELS) as SourceType[]).map((source) => (
                    <div className="channel-card" key={source}>
                      <div className="channel-symbol">{source === "youtube" ? "▶" : source === "smartstore_review" ? "XLS" : "N"}</div>
                      <h3>{SOURCE_LABELS[source]}</h3>
                      <strong>{(rawSources[source] || 0).toLocaleString()}건 수집</strong>
                      <span>{(sources[source] || 0).toLocaleString()}건 분석 반영</span>
                      <p>
                        {source === "youtube"
                          ? "YouTube Data API v3 댓글 수집"
                          : source === "smartstore_review"
                            ? "판매자센터 엑셀 업로드 기반 구매 리뷰"
                            : "Naver Developers Search API 기반 수집"}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {activeTab === "report" && (
            <div className="panel">
              <div className="report-card">
                <div className="report-eyebrow">Executive Weekly</div>
                <h2>{dashboardData?.metadata.productName || productName}.<br />VOC 자동 분석 보고.</h2>
                <p>
                  총 <strong>{total.toLocaleString()}건</strong>의 VOC가 수집·분석되었습니다. 긍정 {pct.positive}%,
                  중립 {pct.neutral}%, 부정 {pct.negative}%이며, 주요 리스크는 부정 발화와 고위험 키워드를 기준으로 산출했습니다.
                </p>
                <div className="recommendations">
                  {(dashboardData?.insights.risk || []).slice(0, 4).map((item, index) => (
                    <div className="rec" key={`${item.title}-${index}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="report-downloads">
                  <a href="/api/export/pdf">PDF 다운로드</a>
                  <a href="/api/export/docx">Word 다운로드</a>
                  <a href="/api/export/xlsx">Excel 다운로드</a>
                  <a href="/api/export/json">JSON 다운로드</a>
                </div>
              </div>
            </div>
          )}

          {activeTab === "asset" && (
            <div className="panel">
              <Section title="데이터 자산" number="01">
                <div className="asset-actions">
                  <a className="btn-secondary link-button" href="/api/export/pdf">
                    PDF
                  </a>
                  <a className="btn-secondary link-button" href="/api/export/docx">
                    Word
                  </a>
                  <a className="btn-secondary link-button" href="/api/export/xlsx">
                    Excel
                  </a>
                  <a className="btn-secondary link-button" href="/api/export/json">
                    JSON
                  </a>
                  <button className="btn-secondary" onClick={() => download("json", dashboardData)}>
                    화면 JSON
                  </button>
                  <button className="btn-secondary" onClick={() => download("csv", recordsToCsv(dashboardData?.vocRecords || []))}>
                    CSV 다운로드
                  </button>
                </div>
                <pre className="asset-pre">{JSON.stringify({ metadata: dashboardData?.metadata, aggregation: dashboardData?.aggregation }, null, 2)}</pre>
              </Section>
            </div>
          )}
        </section>
          </div>
        </section>
      </main>
    </>
  );
}

function ProjectButton({
  run,
  active,
  onOpen,
  onTrash
}: {
  run: AnalysisRun;
  active: boolean;
  onOpen: () => void;
  onTrash: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onOpen}>
      <span>{run.productName}</span>
      <small>{formatRunDate(run.startedAt)}</small>
      <em>{run.status === "completed" ? `${run.vocCount.toLocaleString()}건 조사` : run.status}</em>
      <i
        role="button"
        tabIndex={0}
        className="project-action danger"
        onClick={(event) => {
          event.stopPropagation();
          onTrash();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onTrash();
          }
        }}
      >
        삭제
      </i>
    </button>
  );
}

function TrashProjectButton({ run, onRestore }: { run: AnalysisRun; onRestore: () => void }) {
  return (
    <button className="trashed-project" onClick={onRestore}>
      <span>{run.productName}</span>
      <small>삭제 {formatRunDate(run.deletedAt)} · 영구삭제 {formatRunDate(run.purgeAt)}</small>
      <em>{run.vocCount.toLocaleString()}건 조사</em>
      <i className="project-action restore">복구</i>
    </button>
  );
}

function createEmptyDashboard(productName: string, runs: AnalysisRun[], trashedRuns: AnalysisRun[]): DashboardData {
  const emptySources = { naver_blog: 0, naver_news: 0, naver_cafe: 0, youtube: 0, smartstore_review: 0 };
  const emptySentiment = { positive: 0, neutral: 0, negative: 0 };
  return {
    metadata: {
      productName,
      totalVocCount: 0,
      sourceBreakdown: emptySources,
      rawSourceBreakdown: emptySources,
      runs,
      trashedRuns
    },
    aggregation: {
      sentiment: emptySentiment,
      sentimentPct: emptySentiment,
      quality: {
        firstPersonReviewCount: 0,
        productRelevantCount: 0,
        highRiskCount: 0,
        averageRelevanceScore: 0
      },
      category: {},
      negativeReasons: {},
      keywords: [],
      trend: []
    },
    insights: {
      pain: [],
      strength: [],
      opportunity: [],
      risk: []
    },
    vocRecords: [],
    rawItems: []
  };
}

function CredentialField({ name, label, placeholder, defaultValue }: { name: string; label: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="cred-field">
      <span>{label}</span>
      <input name={name} type={name.toLowerCase().includes("key") || name.toLowerCase().includes("secret") ? "password" : "text"} placeholder={placeholder} defaultValue={defaultValue} />
    </label>
  );
}

function ConnectionPill({ active, label }: { active?: boolean; label: string }) {
  return <span className={`connection-pill ${active ? "on" : ""}`}>{label}</span>;
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        {unit && <em>{unit}</em>}
      </strong>
    </div>
  );
}

function Section({ title, number, children }: { title: string; number: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-header">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InsightList({ title, number, items }: { title: string; number: string; items: { title: string; desc: string; count: number; severity?: string }[] }) {
  return (
    <Section title={title} number={number}>
      <ul className="insight-list">
        {items.length ? (
          items.map((item) => (
            <li key={item.title}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.desc}</p>
              </div>
              <span>{item.count.toLocaleString()}건</span>
            </li>
          ))
        ) : (
          <li>
            <div>
              <strong>분석 대기</strong>
              <p>실제 데이터 분석을 실행하면 이 영역이 자동으로 채워집니다.</p>
            </div>
          </li>
        )}
      </ul>
    </Section>
  );
}

function SentimentBar({ sentiment, pct }: { sentiment: Record<Sentiment, number>; pct: Record<Sentiment, number> }) {
  return (
    <div className="sentiment-wrap">
      <div className="sentiment-bar">
        {(Object.keys(SENTIMENT_LABELS) as Sentiment[]).map((key) => (
          <div key={key} className={key} style={{ width: `${Math.max(pct[key], sentiment[key] ? 8 : 0)}%` }}>
            {pct[key]}%
          </div>
        ))}
      </div>
      <div className="sentiment-legend">
        {(Object.keys(SENTIMENT_LABELS) as Sentiment[]).map((key) => (
          <span key={key}>
            <i className={key} /> {SENTIMENT_LABELS[key]} {sentiment[key].toLocaleString()}건
          </span>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: { label: string; positive: number; neutral: number; negative: number }[] }) {
  const max = Math.max(1, ...data.flatMap((item) => [item.positive, item.neutral, item.negative]));
  return (
    <div className="trend-chart">
      {data.map((item) => (
        <div className="trend-day" key={item.label}>
          <div className="trend-stack">
            <span className="positive" style={{ height: `${(item.positive / max) * 100}%` }} />
            <span className="neutral" style={{ height: `${(item.neutral / max) * 100}%` }} />
            <span className="negative" style={{ height: `${(item.negative / max) * 100}%` }} />
          </div>
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function SourceBars({ sources }: { sources: Record<SourceType, number> }) {
  const max = Math.max(1, ...Object.values(sources));
  return (
    <div className="source-bars">
      {(Object.keys(SOURCE_LABELS) as SourceType[]).map((source) => (
        <div className="source-row" key={source}>
          <span>{SOURCE_LABELS[source]}</span>
          <div><i style={{ width: `${((sources[source] || 0) / max) * 100}%` }} /></div>
          <strong>{(sources[source] || 0).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function QualityGrid({
  quality,
  latestStatus
}: {
  quality: DashboardData["aggregation"]["quality"];
  latestStatus: string;
}) {
  return (
    <div className="quality-grid">
      <div>
        <span>제품 관련 VOC</span>
        <strong>{quality.productRelevantCount.toLocaleString()}건</strong>
      </div>
      <div>
        <span>1인칭 리뷰</span>
        <strong>{quality.firstPersonReviewCount.toLocaleString()}건</strong>
      </div>
      <div>
        <span>평균 관련도</span>
        <strong>{quality.averageRelevanceScore}%</strong>
      </div>
      <div>
        <span>고위험 VOC</span>
        <strong>{quality.highRiskCount.toLocaleString()}건</strong>
      </div>
      <div>
        <span>최근 실행</span>
        <strong>{latestStatus}</strong>
      </div>
    </div>
  );
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {label} <span>{count.toLocaleString()}</span>
    </button>
  );
}

function VocCard({ record }: { record: VocRecord }) {
  return (
    <article className="voc-card">
      <div className="voc-meta">
        <span>{record.id}</span>
        <span>{record.sourceName}</span>
        <span>{record.date}</span>
        <span className={record.sentiment}>{SENTIMENT_LABELS[record.sentiment]}</span>
      </div>
      <h3>{record.title}</h3>
      <p>{record.quote}</p>
      <div className="voc-insight">
        <strong>{record.summary}</strong>
        <span>{record.insight}</span>
      </div>
      <div className="voc-proof">
        <span>관련도 {Math.round(record.relevanceScore * 100)}%</span>
        <span>{record.isFirstPersonReview ? "1인칭 리뷰" : "간접/요약 발화"}</span>
        <span>{record.businessImpact} impact</span>
      </div>
      <p className="voc-evidence">{record.evidence}</p>
      <p className="voc-action">{record.recommendedAction}</p>
      <a href={record.url} target="_blank" rel="noreferrer">원문 열기</a>
    </article>
  );
}

function topNegativeKeyword(data: DashboardData | null) {
  const keyword = data?.aggregation.keywords.find((item) => item.sent === "negative");
  return keyword ? `"${keyword.kw}" 부정 VOC 모니터링 필요.` : "";
}

function formatRunDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function recordsToCsv(records: VocRecord[]) {
  const headers = ["id", "source", "date", "sentiment", "category", "relevanceScore", "isFirstPersonReview", "businessImpact", "summary", "insight", "recommendedAction", "url"];
  const rows = records.map((record) =>
    [
      record.id,
      record.sourceName,
      record.date,
      record.sentiment,
      record.category,
      record.relevanceScore,
      record.isFirstPersonReview,
      record.businessImpact,
      record.summary,
      record.insight,
      record.recommendedAction,
      record.url
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function download(type: "json" | "csv", content: unknown) {
  const text = type === "json" ? JSON.stringify(content, null, 2) : String(content);
  const blob = new Blob([type === "csv" ? `\uFEFF${text}` : text], { type: type === "csv" ? "text/csv;charset=utf-8" : "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maeil-voc-${new Date().toISOString().slice(0, 10)}.${type}`;
  a.click();
  URL.revokeObjectURL(url);
}
