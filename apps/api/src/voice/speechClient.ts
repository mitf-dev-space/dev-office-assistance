import type { Env } from "../env.js";

export type SpeechCreateResult = {
  sessionId: string;
  sampleRate: number;
  engine: string;
};

export class SpeechServiceClient {
  constructor(private readonly env: Env) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (envToken(this.env)) {
      h.Authorization = `Bearer ${envToken(this.env)}`;
    }
    return h;
  }

  private base(): string {
    return this.env.SPEECH_SERVICE_URL.replace(/\/+$/, "");
  }

  async readiness(): Promise<{ ready: boolean; detail: string }> {
    try {
      const res = await fetch(`${this.base()}/readyz`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        return { ready: false, detail: `readyz_${res.status}` };
      }
      return { ready: true, detail: "ok" };
    } catch (err) {
      return { ready: false, detail: err instanceof Error ? err.message : "unreachable" };
    }
  }

  async createSession(): Promise<SpeechCreateResult> {
    const res = await fetch(`${this.base()}/sessions`, {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new SpeechServiceError(res.status, body || "create_failed");
    }
    const data = (await res.json()) as {
      session_id: string;
      sample_rate?: number;
      engine?: string;
    };
    return {
      sessionId: data.session_id,
      sampleRate: data.sample_rate ?? 16000,
      engine: data.engine ?? "unknown",
    };
  }

  async deleteSession(speechSessionId: string): Promise<void> {
    await fetch(`${this.base()}/sessions/${encodeURIComponent(speechSessionId)}`, {
      method: "DELETE",
      headers: this.headers(),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
  }

  audioWsUrl(speechSessionId: string): string {
    const base = this.base().replace(/^http/i, "ws");
    const token = envToken(this.env);
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${base}/sessions/${encodeURIComponent(speechSessionId)}/audio${q}`;
  }
}

function envToken(env: Env): string {
  return env.SPEECH_SERVICE_TOKEN?.trim() ?? "";
}

export class SpeechServiceError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`speech_service_${status}`);
    this.name = "SpeechServiceError";
  }
}
