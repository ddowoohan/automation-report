"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Bot, CheckCircle2, FileDown, Loader2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalysisResult, BenchmarkMode } from "@/types/domain";

interface UploadResponse {
  sessionId: string;
  agencies: string[];
  counts: {
    orders: number;
    customers: number;
    products: number;
  };
}

interface AnalyzeResponse {
  analysis: AnalysisResult;
}

interface InsightResponse {
  messages: Array<{ role: "assistant" | "user"; content: string }>;
}

interface LoadDefaultResponse extends UploadResponse {
  defaultFiles?: {
    orders: string;
    customers: string;
    products: string;
  };
}

let hasAutoLoadedInThisBrowserSession = false;

const RegionSalesMap = dynamic(
  () => import("@/components/dashboard/region-sales-map").then((module) => module.RegionSalesMap),
  {
    ssr: false,
    loading: () => <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">지도 로딩 중...</div>
  }
);

export function DashboardApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string>("");
  const [benchmark, setBenchmark] = useState<BenchmarkMode>("overall");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [insightPrompt, setInsightPrompt] = useState("");
  const [insightMessages, setInsightMessages] = useState<Array<{ role: "assistant" | "user"; content: string }>>([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [defaultDataLabel, setDefaultDataLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoLoadRequestedRef = useRef(false);
  const analysisRequestKeyRef = useRef<string>("");

  const growthTop = useMemo(() => analysis?.growthCustomers.slice(0, 8) ?? [], [analysis]);
  const interpretationLines = useMemo(() => {
    if (!analysis) {
      return [
        "기본 데이터를 불러오면 대리점별 지역 매출 집중도 해석이 표시됩니다.",
        "핵심 권역과 확장 권역을 분리해 읽을 수 있도록 구성됩니다."
      ];
    }

    const top = analysis.regionMain[0];
    const second = analysis.regionMain[1];
    const b2bTop = analysis.b2bRegionAll[0];
    const highPotentialCount = analysis.growthCustomers.filter((customer) => customer.highPotential).length;

    const topText = top ? `${top.region} (${top.share.toFixed(1)}%)` : "주요 권역";
    const secondText = second ? `${second.region} (${second.share.toFixed(1)}%)` : "차순위 권역";
    const b2bTopText = b2bTop ? `${b2bTop.region} (${b2bTop.share.toFixed(1)}%)` : "전체 기준 주요 권역";

    return [
      `전체 B2B 기준 주요 권역은 ${b2bTopText}이며, ${analysis.agency}는 ${topText}, ${secondText} 중심으로 형성되어 있습니다.`,
      `반복 구매 기반은 안정적이며, 현재 성장 잠재 고객은 ${highPotentialCount}명으로 집계됩니다.`
    ];
  }, [analysis]);

  const actionPlanItems = useMemo(() => {
    if (!analysis) {
      return [
        "핵심 권역 유지 전략과 확장 권역 전환 전략을 분리해 수립합니다.",
        "고성장 고객군을 우선 타겟으로 제안 빈도를 높입니다.",
        "성과는 신규수보다 재구매율/전환율 지표로 추적합니다."
      ];
    }

    const expansionTargets = analysis.regionExpansion
      .slice(0, 3)
      .map((region) => region.region)
      .filter(Boolean);
    const targetText = expansionTargets.length > 0 ? expansionTargets.join(", ") : "저비중 권역";
    const highPotentialCount = analysis.growthCustomers.filter((customer) => customer.highPotential).length;

    return [
      `${targetText} 권역은 단기 매출보다 첫 구매 경험 축적과 재접촉 캠페인 중심으로 운영합니다.`,
      `성장 잠재 고객 ${highPotentialCount}명을 기준으로 신제품+연관품목 동시 제안 시나리오를 적용합니다.`,
      "영업 관점은 '이미 장악한 지역'보다 '확장 여지가 남은 권역'의 전환률 개선에 둡니다."
    ];
  }, [analysis]);

  useEffect(() => {
    if (autoLoadRequestedRef.current) {
      return;
    }
    if (hasAutoLoadedInThisBrowserSession) {
      return;
    }
    autoLoadRequestedRef.current = true;
    hasAutoLoadedInThisBrowserSession = true;
    void loadDefaultCsvs();
  }, []);

  useEffect(() => {
    if (!sessionId || !selectedAgency) {
      return;
    }
    const currentSessionId = sessionId;
    const currentAgency = selectedAgency;

    const requestKey = `${currentSessionId}|${currentAgency}|${benchmark}`;
    if (analysisRequestKeyRef.current === requestKey) {
      return;
    }
    analysisRequestKeyRef.current = requestKey;

    let cancelled = false;

    async function run() {
      try {
        setBusy(true);
        setError(null);
        const nextAnalysis = await runAnalysis(currentSessionId, currentAgency, benchmark);
        if (cancelled) {
          return;
        }
        setAnalysis(nextAnalysis);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "분석 오류";
          if (message.includes("세션이 만료")) {
            await loadDefaultCsvs();
            return;
          }
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedAgency, benchmark]);

  async function applyLoadedSession(payload: UploadResponse) {
    setSessionId(payload.sessionId);
    setAgencies(payload.agencies);

    const nextAgency = payload.agencies.includes(selectedAgency) ? selectedAgency : payload.agencies[0] ?? "";
    setSelectedAgency(nextAgency);
  }

  async function loadDefaultCsvs() {
    try {
      setBusy(true);
      setCsvLoading(true);
      setError(null);

      const response = await fetch("/api/load-default", {
        method: "POST"
      });
      const payload = (await response.json()) as LoadDefaultResponse & { error?: string };

      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error || "기본 데이터 로드에 실패했습니다.");
      }

      await applyLoadedSession(payload);

      if (payload.defaultFiles) {
        setDefaultDataLabel(
          `기본 데이터 로드됨: ${payload.defaultFiles.orders}, ${payload.defaultFiles.customers}, ${payload.defaultFiles.products}`
        );
      } else {
        setDefaultDataLabel("기본 데이터 로드됨");
      }
    } catch (err) {
      setDefaultDataLabel(null);
      setError(err instanceof Error ? err.message : "기본 데이터 로드 오류");
    } finally {
      setCsvLoading(false);
      setBusy(false);
    }
  }

  async function runAnalysis(currentSession: string, agency: string, currentBenchmark: BenchmarkMode): Promise<AnalysisResult> {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSession,
        agency,
        benchmark: currentBenchmark
      })
    });

    const payload = (await response.json()) as AnalyzeResponse & { error?: string };

    if (!response.ok || !payload.analysis) {
      throw new Error(payload.error || "분석 실패");
    }

    return payload.analysis;
  }

  async function requestInsight() {
    if (!analysis) {
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const response = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency: analysis.agency,
          benchmark: analysis.benchmark,
          userPrompt: insightPrompt.trim() || undefined
        })
      });

      const payload = (await response.json()) as InsightResponse & { error?: string };
      if (!response.ok || !payload.messages) {
        throw new Error(payload.error || "인사이트 요청 실패");
      }

      setInsightMessages(payload.messages);
      setInsightPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "인사이트 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] p-4 md:p-8">
      {csvLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border bg-white px-5 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm font-semibold">CSV 로딩 및 전처리 중...</p>
          </div>
        </div>
      ) : null}

      <section className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-4xl">DESKER 영업 전략 리포트</h1>
          <p className="mt-2 text-sm text-muted-foreground">docs 기본 데이터를 자동 로드하고 대리점 단위로 분석합니다.</p>
        </div>
        <Button variant="secondary" className="gap-2" disabled>
          <FileDown className="h-4 w-4" /> PDF 다운로드 (Phase 4)
        </Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>입력/필터</CardTitle>
            <CardDescription>DB 없이 세션 단위로 처리됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="secondary" className="w-full" onClick={loadDefaultCsvs} disabled={busy}>
              기본 데이터 다시 불러오기
            </Button>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">대리점 선택</p>
              <Select value={selectedAgency} onValueChange={(value) => setSelectedAgency(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="대리점 선택" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">비교 기준</p>
              <Select value={benchmark} onValueChange={(value) => setBenchmark(value as BenchmarkMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overall">전체 평균</SelectItem>
                  <SelectItem value="club1000">Club 1000 평균</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {defaultDataLabel ? <p className="text-xs text-teal-700">{defaultDataLabel}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          >
            {(analysis?.kpis ?? []).map((kpi, idx) => (
              <motion.div
                key={kpi.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>{kpi.label}</CardDescription>
                    <CardTitle className="text-xl">{kpi.value}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-xs ${
                        kpi.tone === "up" ? "text-teal-700" : kpi.tone === "down" ? "text-orange-700" : "text-muted-foreground"
                      }`}
                    >
                      비교 대비 {kpi.delta.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" /> 지역별 매출 분포 (Geographic View)
              </CardTitle>
              <CardDescription>대리점 선택값에 맞춰 지역 매출 포인트가 자동 반영됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RegionSalesMap overallStats={analysis?.b2bRegionAll ?? []} agencyStats={analysis?.regionAll ?? []} />

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-slate-900 text-slate-100">
                  <div className="flex items-center gap-2 border-b border-amber-400/20 bg-slate-800/70 px-4 py-3 text-amber-300">
                    <TrendingUp className="h-4 w-4" />
                    <p className="text-sm font-semibold">데이터 해석 (Interpretation)</p>
                  </div>
                  <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-slate-200">
                    {interpretationLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-indigo-500/20 bg-slate-900 text-slate-100">
                  <div className="flex items-center gap-2 border-b border-indigo-400/20 bg-indigo-900/25 px-4 py-3 text-indigo-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">활용 가이드 (Action Plan)</p>
                  </div>
                  <div className="px-4 py-4">
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-200">
                      {actionPlanItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">핵심 지역 비중 TOP 8</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(analysis?.regionMain ?? []).map((row) => (
                  <div key={row.region} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{row.region}</span>
                      <span>{row.share.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(row.share, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">공략 필요 지역 TOP 5</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(analysis?.regionExpansion ?? []).map((row) => (
                  <div key={row.region} className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm">
                    <span>{row.region}</span>
                    <span className="font-semibold text-orange-700">{row.share.toFixed(2)}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">성장 가능 고객</CardTitle>
                <CardDescription>성장배수 2.0 이상 + 누적주문금액 상위 30%</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {growthTop.map((customer) => (
                  <div key={customer.bizNo} className="rounded-md border bg-white px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <strong>{customer.customerName}</strong>
                      <span className={customer.highPotential ? "text-teal-700" : "text-muted-foreground"}>
                        {customer.growthMultiplier.toFixed(2)}x
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">누적 {customer.cumulativeAmount.toLocaleString("ko-KR")}원</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">신제품 월별 판매 추이</CardTitle>
                <CardDescription>
                  단독구매 {analysis?.crossSellRatio.solo ?? 0}건 / 동시구매 {analysis?.crossSellRatio.crossSell ?? 0}건
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(analysis?.monthlyNewProducts ?? []).map((row) => (
                  <div key={row.month} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                    <span>{row.month}</span>
                    <span>
                      수량 {row.quantity.toLocaleString("ko-KR")} / 금액 {row.amount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" /> AI 영업 전략 코멘트
              </CardTitle>
              <CardDescription>요청 문구를 입력하면 코멘트를 재작성합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={insightPrompt}
                  onChange={(event) => setInsightPrompt(event.target.value)}
                  placeholder="예: 수성구 지역 공략을 더 강조해줘"
                />
                <Button variant="secondary" onClick={requestInsight} disabled={busy || !analysis}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "요청"}
                </Button>
              </div>

              <div className="space-y-2">
                {insightMessages.map((msg, idx) => (
                  <div key={`${msg.role}-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                    <p>{msg.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
