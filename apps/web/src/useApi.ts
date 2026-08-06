import { useCallback } from "react";
import { apiFetch, apiFetchWithGraph } from "./apiClient";

export function useApi() {
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      return apiFetch(path, init);
    },
    [],
  );

  const requestWithGraph = useCallback(
    async (path: string, graphToken: string, init: RequestInit = {}) => {
      return apiFetchWithGraph(path, graphToken, init);
    },
    [],
  );

  const uploadTriageAttachment = useCallback(
    (triageId: string, file: File) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return apiFetch(`/api/triage-items/${triageId}/attachments`, {
        method: "POST",
        body,
      });
    },
    [],
  );

  const uploadExpenseReceipt = useCallback((expenseId: string, file: File) => {
    const body = new FormData();
    body.append("file", file, file.name);
    return apiFetch(`/api/expenses/${expenseId}/receipt`, {
      method: "POST",
      body,
    });
  }, []);

  const uploadIncidentAttachment = useCallback((incidentId: string, file: File) => {
    const body = new FormData();
    body.append("file", file, file.name);
    return apiFetch(`/api/incidents/${incidentId}/attachments`, {
      method: "POST",
      body,
    });
  }, []);

  return {
    request,
    requestWithGraph,
    uploadTriageAttachment,
    uploadExpenseReceipt,
    uploadIncidentAttachment,
  };
}
