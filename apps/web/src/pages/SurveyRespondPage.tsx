import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PublicSurveyDto } from "@office/types";
import { PageHeader } from "../components/PageHeader";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

type InvitationCheck = { valid: boolean; code?: string };

export function SurveyRespondPage() {
  const { token } = useParams<{ token: string }>();
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [invitationState, setInvitationState] = useState<InvitationCheck | null>(null);

  // First, resolve the survey id from the token via the public endpoint.
  const resolveQuery = useQuery({
    queryKey: ["survey-resolve", token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/surveys/resolve/${token}`);
      if (!res.ok) throw new Error("resolve_failed");
      return (await res.json()) as { surveyId: string; valid: boolean; code?: string };
    },
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (resolveQuery.data) {
      setInvitationState({ valid: resolveQuery.data.valid, code: resolveQuery.data.code });
      if (resolveQuery.data.valid) setSurveyId(resolveQuery.data.surveyId);
    }
  }, [resolveQuery.data]);

  const surveyQuery = useQuery({
    queryKey: ["public-survey", surveyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/surveys/${surveyId}`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as PublicSurveyDto;
    },
    enabled: Boolean(surveyId) && invitationState?.valid === true,
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/surveys/${surveyId}/respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "submit_failed");
      }
    },
    onSuccess: () => setSubmitted(true),
  });

  const survey = surveyQuery.data;
  const allAnswered = survey ? survey.questions.every((q) => answers[q.id]) : false;

  if (resolveQuery.isLoading) {
    return (
      <div className="app-page">
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (invitationState && !invitationState.valid) {
    const message =
      invitationState.code === "used"
        ? "This survey has already been completed using this invitation."
        : invitationState.code === "expired"
          ? "This invitation has expired."
          : invitationState.code === "not_open"
            ? "This survey is no longer accepting responses."
            : "This invitation is not valid.";
    return (
      <div className="app-page">
        <div className="card">
          <p role="alert" style={{ margin: 0 }}>
            {message}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="app-page">
        <div className="card">
          <h2 className="card__title">Thank you</h2>
          <p className="hint-ok">Your response has been submitted anonymously.</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="app-page">
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Loading survey…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Survey"
        title={survey.title}
        lead={survey.description ?? undefined}
      />
      {survey.closesAt && (
        <p className="muted">
          Closes: {new Date(survey.closesAt).toLocaleString()}
        </p>
      )}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Questions</h2>
          <p className="card__sub">Your answers are anonymous and cannot be edited after submission.</p>
        </div>
        {!confirming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirming(true);
            }}
          >
            {survey.questions.map((q) => (
              <div key={q.id} className="field">
                <label>
                  {q.position}. {q.text}
                </label>
                <div className="survey-yesno">
                  <label className="incident-involved-item">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === "yes"}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: "yes" }))}
                    />
                    <span>Yes</span>
                  </label>
                  <label className="incident-involved-item">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[q.id] === "no"}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: "no" }))}
                    />
                    <span>No</span>
                  </label>
                </div>
              </div>
            ))}
            {submitMut.isError && <p role="alert">{(submitMut.error as Error).message}</p>}
            <div className="form-actions">
              <button type="submit" className="primary" disabled={!allAnswered}>
                Review answers
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p>
              Please confirm your answers. Once submitted, they cannot be changed.
            </p>
            <ul>
              {survey.questions.map((q) => (
                <li key={q.id}>
                  {q.position}. {q.text} — <strong>{answers[q.id]}</strong>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={submitMut.isPending}
                onClick={() => setConfirming(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={submitMut.isPending}
                onClick={() => submitMut.mutate()}
              >
                {submitMut.isPending ? "Submitting…" : "Confirm submission"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
