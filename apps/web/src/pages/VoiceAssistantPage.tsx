import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStop,
  IconSend,
} from "@tabler/icons-react";
import { useState } from "react";
import { useVoiceSession } from "../features/voice/hooks/useVoiceSession";

export function VoiceAssistantPage() {
  // Keep local state above the session hook so HMR hook-order stays stable.
  const [textFallback, setTextFallback] = useState("");
  const voice = useVoiceSession();

  const busy =
    voice.state !== "idle" &&
    voice.state !== "failed" &&
    voice.state !== "closed";

  return (
    <Stack gap="lg" maw={880}>
      <div>
        <Title order={2}>Voice assistant</Title>
        <Text c="dimmed" size="sm" mt={4}>
          Speak in English. Live transcription updates while you talk. Mutations require on-screen
          confirmation. Audio is processed by the Helm speech service (Parakeet) and reasoning uses
          OpenRouter on the server — keys never enter the browser.
        </Text>
      </div>

      {voice.statusInfo && (
        <Alert color={voice.statusInfo.enabled ? "teal" : "gray"} title="Availability">
          <Text size="sm">
            Feature {voice.statusInfo.enabled ? "enabled" : "disabled"} · Role{" "}
            {voice.statusInfo.allowed ? "allowed" : "not allowed"} · Speech{" "}
            {voice.statusInfo.speechReady ? "ready" : "not ready"}
          </Text>
          <Text size="sm" mt={4}>
            {voice.statusInfo.languageNote}
          </Text>
        </Alert>
      )}

      {voice.error && (
        <Alert color="red" title="Voice error">
          {voice.error}
        </Alert>
      )}

      {voice.micWarning && !voice.error && (
        <Alert color="yellow" title="Microphone unavailable — keyboard mode">
          {voice.micWarning}
        </Alert>
      )}

      <Card withBorder padding="md" radius="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <Badge variant="light">{voice.state}</Badge>
            {voice.sessionId && (
              <Badge variant="outline" color="gray">
                session {voice.sessionId.slice(0, 8)}
              </Badge>
            )}
            {busy && voice.micWarning && (
              <Badge variant="outline" color="yellow">
                text only
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {!busy ? (
              <Button
                leftSection={<IconMicrophone size={16} />}
                onClick={() => void voice.start()}
                disabled={voice.statusInfo?.enabled === false}
              >
                Start voice session
              </Button>
            ) : (
              <>
                <Button
                  variant="default"
                  leftSection={
                    voice.muted ? <IconMicrophoneOff size={16} /> : <IconMicrophone size={16} />
                  }
                  onClick={() => voice.setMuted((m) => !m)}
                >
                  {voice.muted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="light" leftSection={<IconSend size={16} />} onClick={voice.sendNow}>
                  Send now
                </Button>
                <Button variant="subtle" onClick={voice.cancelUtterance}>
                  Cancel utterance
                </Button>
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconPlayerStop size={16} />}
                  onClick={() => void voice.stop()}
                >
                  End session
                </Button>
              </>
            )}
          </Group>
        </Group>

        <Stack gap="sm">
          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Live transcript (provisional)
            </Text>
            <Text
              mt={4}
              style={{ fontStyle: "italic", minHeight: "1.5rem" }}
              aria-live="polite"
              aria-atomic="true"
            >
              {voice.partial || (busy ? "Listening…" : "—")}
            </Text>
          </div>

          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Finalized utterances
            </Text>
            <Stack gap={4} mt={4}>
              {voice.finals.length === 0 && <Text c="dimmed">—</Text>}
              {voice.finals.map((f) => (
                <Text key={f.id}>{f.text}</Text>
              ))}
            </Stack>
          </div>

          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Assistant
            </Text>
            <Text mt={4} style={{ whiteSpace: "pre-wrap", minHeight: "1.5rem" }}>
              {voice.assistant || "—"}
            </Text>
          </div>

          {voice.tools.length > 0 && (
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                Tool activity
              </Text>
              <Stack gap={4} mt={4}>
                {voice.tools.map((t, i) => (
                  <Text key={`${t.id}-${i}`} size="sm">
                    {t.name}
                    {t.result ? " · done" : " · running"}
                  </Text>
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </Card>

      {voice.drafts.map((d) => (
        <Card key={d.id} withBorder padding="md" radius="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Badge mb={6}>{d.status}</Badge>
              <Text fw={600}>{d.title}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {d.summary}
              </Text>
              <Text size="xs" mt={6}>
                Kind: {d.kind}
              </Text>
            </div>
            {d.status === "pending" && (
              <Group>
                <Button onClick={() => void voice.confirmDraft(d.id)}>Confirm</Button>
                <Button variant="default" onClick={() => void voice.cancelDraft(d.id)}>
                  Cancel
                </Button>
              </Group>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            Voice “yes” alone will not apply this change — use Confirm.
          </Text>
        </Card>
      ))}

      <Card withBorder padding="md" radius="md">
        <Text fw={600} mb="xs">
          Text fallback
        </Text>
        <Textarea
          minRows={2}
          value={textFallback}
          onChange={(e) => setTextFallback(e.currentTarget.value)}
          placeholder="Type when microphone is unavailable…"
          disabled={!busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (voice.sendUserText(textFallback)) setTextFallback("");
            }
          }}
        />
        <Group mt="sm" justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {busy
              ? "Enter or Send runs the same OpenRouter reasoning path (English)."
              : "Start a session first, then type here if the mic is blocked."}
          </Text>
          <Button
            size="xs"
            leftSection={<IconSend size={14} />}
            disabled={!busy || !textFallback.trim()}
            onClick={() => {
              if (voice.sendUserText(textFallback)) setTextFallback("");
            }}
          >
            Send
          </Button>
        </Group>
      </Card>
    </Stack>
  );
}
