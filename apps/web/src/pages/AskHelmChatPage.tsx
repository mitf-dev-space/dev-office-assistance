import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Stack, Text, Textarea } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useApi } from "../useApi";
import { PageHeader } from "../components/PageHeader";
import { AiAssistStatusBadge } from "../components/ai/AiAssistStatusBadge";

type ChatMsg = { role: "user" | "assistant"; content: string; citations?: string[]; toolsUsed?: string[] };

export function AskHelmChatPage() {
  const { request } = useApi();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  const chatMut = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await request("/api/assist/chat", {
        method: "POST",
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "chat_failed");
      return data as {
        answer: string;
        citations: string[];
        toolsUsed: string[];
        source: string;
      };
    },
    onSuccess: (data, message) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: message },
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          toolsUsed: data.toolsUsed,
        },
      ]);
      setInput("");
    },
  });

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Workspace AI"
        title="Ask Helm"
        lead="Natural-language questions over triage, morning brief, blocker radar, planning, decisions, catalog gaps, and standup. Read-only — writes go through the review queue."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AiAssistStatusBadge />
            <Link to="/apps/ai/review" className="btn btn-ghost">
              Review queue
            </Link>
            <Link to="/apps/ai" className="btn btn-ghost">
              AI settings
            </Link>
          </div>
        }
      />

      <section className="card ai-assist" aria-label="Ask Helm chat">
        <Stack gap="md">
          <div
            style={{
              minHeight: 280,
              maxHeight: 480,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {messages.length === 0 ? (
              <Text size="sm" c="dimmed">
                Examples: “What needs attention today?”, “Which blockers are hot?”, “Top catalog gaps?”
              </Text>
            ) : null}
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}`}
                className={m.role === "assistant" ? "ai-assist__result" : undefined}
                style={
                  m.role === "user"
                    ? {
                        alignSelf: "flex-end",
                        maxWidth: "85%",
                        padding: "0.6rem 0.85rem",
                        borderRadius: 8,
                        background: "var(--mantine-color-gray-1)",
                      }
                    : { maxWidth: "95%" }
                }
              >
                <Text size="xs" c="dimmed" mb={4}>
                  {m.role === "user" ? "You" : "Helm"}
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {m.content}
                </Text>
                {m.toolsUsed?.length ? (
                  <Text size="xs" c="dimmed" mt={6}>
                    Tools: {m.toolsUsed.join(", ")}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>

          {chatMut.isError ? (
            <Text size="sm" c="red" role="alert">
              {chatMut.error instanceof Error ? chatMut.error.message : "chat_failed"}
            </Text>
          ) : null}

          <Textarea
            minRows={3}
            placeholder="Ask about open blockers, the morning brief, planning, or catalog gaps…"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && input.trim()) {
                chatMut.mutate(input.trim());
              }
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <Text size="xs" c="dimmed">
              Ctrl/⌘ + Enter to send
            </Text>
            <Button
              loading={chatMut.isPending}
              disabled={!input.trim()}
              onClick={() => chatMut.mutate(input.trim())}
            >
              Ask
            </Button>
          </div>
        </Stack>
      </section>
    </div>
  );
}
