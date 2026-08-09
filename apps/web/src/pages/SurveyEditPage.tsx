import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DevTeam, SurveyDto, SurveyEligibilityRule } from "@office/types";
import { DEV_TEAMS, SURVEY_MAX_QUESTIONS } from "@office/types";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";

type QuestionRow = { id: number; text: string };

export function SurveyEditPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { request } = useApi();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([{ id: 1, text: "" }]);
  const [eligibilityKind, setEligibilityKind] = useState<"all" | "department" | "specific">("all");
  const [department, setDepartment] = useState<DevTeam>("backend");
  const [specificIds, setSpecificIds] = useState<string[]>([]);
  const [closesAt, setClosesAt] = useState("");
  const [showResultsAfterClose, setShowResultsAfterClose] = useState(false);
  const [minResponsesToShow, setMinResponsesToShow] = useState(5);

  const surveyQuery = useQuery({
    queryKey: ["survey", id],
    queryFn: async () => {
      const res = await request(`/api/surveys/${id}`);
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()) as SurveyDto;
    },
    enabled: isEdit,
  });

  const developersQuery = useQuery({
    queryKey: ["developers"],
    queryFn: async () => {
      const res = await request("/api/developers");
      if (!res.ok) throw new Error("developers_failed");
      return (await res.json()) as { developers: Array<{ id: string; displayName: string }> };
    },
  });

  useEffect(() => {
    const s = surveyQuery.data;
    if (!s) return;
    setTitle(s.title);
    setDescription(s.description ?? "");
    setQuestions(s.questions.map((q) => ({ id: q.position, text: q.text })));
    setClosesAt(s.closesAt ? s.closesAt.slice(0, 16) : "");
    setShowResultsAfterClose(s.showResultsAfterClose);
    setMinResponsesToShow(s.minResponsesToShow);
  }, [surveyQuery.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const eligibility: SurveyEligibilityRule =
        eligibilityKind === "all"
          ? { kind: "all" }
          : eligibilityKind === "department"
            ? { kind: "department", team: department }
            : { kind: "specific", developerIds: specificIds };
      const payload = {
        title,
        description: description || null,
        questions: questions.map((q) => ({ text: q.text })),
        eligibility,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        showResultsAfterClose,
        minResponsesToShow,
      };
      const res = isEdit
        ? await request(`/api/surveys/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await request("/api/surveys", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "save_failed");
      }
      return (await res.json()) as SurveyDto;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["surveys"] });
      navigate(`/surveys/${data.id}/results`);
    },
  });

  const addQuestion = () => {
    if (questions.length >= SURVEY_MAX_QUESTIONS) return;
    setQuestions((prev) => [...prev, { id: Date.now(), text: "" }]);
  };
  const removeQuestion = (qid: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== qid));
  };
  const updateQuestion = (qid: number, text: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, text } : q)));
  };

  const developers = developersQuery.data?.developers ?? [];
  const toggleSpecific = (devId: string) => {
    setSpecificIds((prev) =>
      prev.includes(devId) ? prev.filter((x) => x !== devId) : [...prev, devId],
    );
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Surveys"
        title={isEdit ? "Edit survey" : "New survey"}
        lead="Add a title, 1–10 Yes/No questions, and choose which employees are eligible. Drafts can be edited until published."
      />
      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Details</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="desc">Description (optional)</label>
            <textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Questions (Yes/No)</label>
            <div className="survey-questions">
              {questions.map((q, i) => (
                <div key={q.id} className="survey-question-row">
                  <span className="survey-question-num">{i + 1}.</span>
                  <input
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, e.target.value)}
                    placeholder={`Question ${i + 1}`}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={questions.length <= 1}
                    onClick={() => removeQuestion(q.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={questions.length >= SURVEY_MAX_QUESTIONS}
              onClick={addQuestion}
            >
              Add question ({questions.length}/{SURVEY_MAX_QUESTIONS})
            </button>
          </div>

          <div className="field">
            <label>Eligible employees</label>
            <div className="survey-eligibility">
              <label className="incident-involved-item">
                <input
                  type="radio"
                  name="eligibility"
                  checked={eligibilityKind === "all"}
                  onChange={() => setEligibilityKind("all")}
                />
                <span>All active employees</span>
              </label>
              <label className="incident-involved-item">
                <input
                  type="radio"
                  name="eligibility"
                  checked={eligibilityKind === "department"}
                  onChange={() => setEligibilityKind("department")}
                />
                <span>A department</span>
              </label>
              <label className="incident-involved-item">
                <input
                  type="radio"
                  name="eligibility"
                  checked={eligibilityKind === "specific"}
                  onChange={() => setEligibilityKind("specific")}
                />
                <span>Specific employees</span>
              </label>
            </div>
            {eligibilityKind === "department" && (
              <select value={department} onChange={(e) => setDepartment(e.target.value as DevTeam)}>
                {DEV_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            {eligibilityKind === "specific" && (
              <div className="incident-involved-list">
                {developers.map((d) => (
                  <label key={d.id} className="incident-involved-item">
                    <input
                      type="checkbox"
                      checked={specificIds.includes(d.id)}
                      onChange={() => toggleSpecific(d.id)}
                    />
                    <span>{d.displayName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="closesAt">Automatic closing date/time (optional)</label>
            <input
              id="closesAt"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>

          <div className="field field--row">
            <input
              id="showResults"
              type="checkbox"
              checked={showResultsAfterClose}
              onChange={(e) => setShowResultsAfterClose(e.target.checked)}
            />
            <label htmlFor="showResults" style={{ margin: 0, fontWeight: 600 }}>
              Show results to employees after the survey closes
            </label>
          </div>

          <div className="field">
            <label htmlFor="minResponses">Minimum responses before results are revealed</label>
            <input
              id="minResponses"
              type="number"
              min={0}
              value={minResponsesToShow}
              onChange={(e) => setMinResponsesToShow(Number(e.target.value))}
            />
          </div>

          {saveMut.isError && <p role="alert">{(saveMut.error as Error).message}</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
