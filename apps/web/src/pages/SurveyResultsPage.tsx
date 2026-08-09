import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SurveyResultsDto } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { EditPageFormSkeleton } from "../components/skeletons/AppSkeletons";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SurveyResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useApi();

  const resultsQuery = useQuery({
    queryKey: ["survey-results", id],
    queryFn: async () => {
      const res = await request(`/api/surveys/${id}/results`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as SurveyResultsDto;
    },
    enabled: Boolean(id),
  });

  const pdfMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/surveys/${id}/results/pdf`);
      if (!res.ok) throw new Error("pdf_failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `survey-results-${resultsQuery.data?.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "survey"}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    },
  });

  const csvMut = useMutation({
    mutationFn: async () => {
      const res = await request(`/api/surveys/${id}/results/csv`);
      if (!res.ok) throw new Error("csv_failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `survey-results-${resultsQuery.data?.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "survey"}.csv`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    },
  });

  if (resultsQuery.isLoading) return <EditPageFormSkeleton />;
  if (resultsQuery.isError || !resultsQuery.data) {
    return (
      <div className="app-page">
        <div className="card">
          <p role="alert" style={{ margin: 0 }}>
            Could not load results.
          </p>
        </div>
      </div>
    );
  }

  const r = resultsQuery.data;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Surveys"
        title={r.title}
        lead="Aggregate results. Responses are anonymous — no individual answers are shown."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={csvMut.isPending}
              onClick={() => csvMut.mutate()}
            >
              {csvMut.isPending ? "Exporting…" : "Export CSV"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={pdfMut.isPending}
              onClick={() => pdfMut.mutate()}
            >
              {pdfMut.isPending ? "Generating…" : "Export Results as PDF"}
            </button>
          </>
        }
      />

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Overview</h2>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <span className="metric-value">{r.eligibleCount}</span>
            <span className="metric-label">Eligible employees</span>
          </div>
          <div className="metric">
            <span className="metric-value">{r.responseCount}</span>
            <span className="metric-label">Responses</span>
          </div>
          <div className="metric">
            <span className="metric-value">{r.participationPercent}%</span>
            <span className="metric-label">Participation</span>
          </div>
          <div className="metric">
            <span className="metric-value">
              <span className={`badge badge--${r.status}`}>{r.status}</span>
            </span>
            <span className="metric-label">Status</span>
          </div>
        </div>
        <dl className="incident-meta" style={{ marginTop: "1rem" }}>
          <div>
            <dt>Published</dt>
            <dd>{formatDate(r.publishedAt)}</dd>
          </div>
          <div>
            <dt>Closed</dt>
            <dd>{formatDate(r.closedAt)}</dd>
          </div>
        </dl>
        {!r.revealed && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            Results are hidden until at least {r.eligibleCount > 0 ? "" : ""}responses are received
            (anonymity threshold). Individual responses are never shown.
          </p>
        )}
      </div>

      {r.questionResults.map((q) => {
        const yesFrac = q.total > 0 ? q.yes / q.total : 0;
        const noFrac = q.total > 0 ? q.no / q.total : 0;
        return (
          <div className="card" key={q.questionId}>
            <div className="card__head">
              <h2 className="card__title">
                Q{q.position}. {q.text}
              </h2>
              <p className="card__sub">{q.total} answer(s)</p>
            </div>
            <div className="survey-result-bar">
              <div className="survey-result-bar__label">
                <span>Yes</span>
                <span>
                  {q.yes} ({q.yesPercent}%)
                </span>
              </div>
              <div className="survey-result-bar__track">
                <div
                  className="survey-result-bar__fill survey-result-bar__fill--yes"
                  style={{ width: `${yesFrac * 100}%` }}
                />
              </div>
              <div className="survey-result-bar__label">
                <span>No</span>
                <span>
                  {q.no} ({q.noPercent}%)
                </span>
              </div>
              <div className="survey-result-bar__track">
                <div
                  className="survey-result-bar__fill survey-result-bar__fill--no"
                  style={{ width: `${noFrac * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
