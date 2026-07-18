import { useState, type ReactNode } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { AiAssistStatusBadge } from "./AiAssistStatusBadge";

export type AiAssistAction = {
  label: string;
  loading?: boolean;
  onSuggest: () => void | Promise<void>;
  disabled?: boolean;
};

type Props = {
  /** Card title — defaults to Workspace AI */
  title?: string;
  lead?: string;
  /** Single primary action (standup / catalog / forge) */
  label?: string;
  loading?: boolean;
  onSuggest?: () => void | Promise<void>;
  /** Multiple actions in one card (triage) */
  actions?: AiAssistAction[];
  error?: string | null;
  suggestion?: ReactNode;
  source?: string | null;
  onAccept?: () => void;
  acceptLabel?: string;
};

function sourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === "heuristic+llm" || source === "llm") return "Refined with workspace LLM";
  if (source === "heuristic") return "Draft from workspace rules";
  return source;
}

export function AiAssistPanel({
  title = "Workspace AI",
  lead = "Suggestions stay on this page until you accept or dismiss them.",
  label,
  loading,
  onSuggest,
  actions,
  error,
  suggestion,
  source,
  onAccept,
  acceptLabel = "Accept suggestion",
}: Props) {
  const [open, setOpen] = useState(true);
  const resolvedActions: AiAssistAction[] =
    actions ??
    (label && onSuggest
      ? [{ label, loading, onSuggest }]
      : []);

  return (
    <section className="card ai-assist" aria-label={title}>
      <div className="card__head card__head--row">
        <div>
          <h2 className="card__title">{title}</h2>
          {lead ? <p className="card__sub">{lead}</p> : null}
        </div>
        <div className="card__head__actions">
          <AiAssistStatusBadge />
        </div>
      </div>

      <div className="ai-assist__actions">
        {resolvedActions.map((action) => (
          <Button
            key={action.label}
            leftSection={<IconSparkles size={16} />}
            variant="light"
            className="ai-assist__trigger"
            loading={action.loading}
            disabled={action.disabled}
            onClick={() => {
              setOpen(true);
              void action.onSuggest();
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {error ? (
        <div className="ai-assist__error" role="alert">
          <strong>Assist failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {open && suggestion ? (
        <div className="ai-assist__result">
          <div className="ai-assist__result-head">
            <span className="ai-assist__result-label">Suggestion</span>
            {sourceLabel(source) ? (
              <span className="ai-assist__source">{sourceLabel(source)}</span>
            ) : null}
          </div>
          <Stack gap="sm" className="ai-assist__result-body">
            {typeof suggestion === "string" ? <Text size="sm">{suggestion}</Text> : suggestion}
            {onAccept ? (
              <Group gap="xs" mt={4}>
                <Button size="compact-sm" onClick={onAccept}>
                  {acceptLabel}
                </Button>
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setOpen(false)}>
                  Dismiss
                </Button>
              </Group>
            ) : (
              <Group gap="xs" mt={4}>
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setOpen(false)}>
                  Dismiss
                </Button>
              </Group>
            )}
          </Stack>
        </div>
      ) : null}
    </section>
  );
}
