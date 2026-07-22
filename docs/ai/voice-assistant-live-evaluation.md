# Voice Assistant — Live Evaluation (Loop 9)

Opt-in only. **Never** enable in standard CI.

```env
RUN_PARAKEET_LIVE_TESTS=true
RUN_OPENROUTER_LIVE_TESTS=true
```

## Scope

| Area | Measure |
|------|---------|
| STT | Time to first partial, partial update frequency, finalization latency, WER (with reference), name/date accuracy |
| Reasoning | Tool-selection accuracy, OpenRouter latency, cost per turn |
| Stability | Concurrent sessions, GPU memory |
| Conditions | Laptop mic, headset, quiet/noisy office, fast/hesitant speech, repo names |

## Constraints

- English-only (Parakeet Unified EN 0.6B). Do not claim Arabic/Libyan quality.
- Use non-production data and a dedicated OpenRouter budget.
- Stop when `AI_DAILY_BUDGET_USD` is reached.
- Tag sessions in audit metadata as `live_eval=true` when scripting.

## Procedure (manual / scripted)

1. Start speech with `SPEECH_ENGINE=parakeet` and verified `/readyz`.
2. Enable voice + OpenRouter on a local/dev API.
3. Sign in as `lead@local.dev`.
4. Open `/apps/ai/voice`, start session, speak the corpus phrases.
5. Record timestamps and transcripts into a dated sheet under `docs/ai/evals/` (create when first run).
6. Tear down sessions; confirm mic tracks stop.

## Status

No live measurements are recorded in-repo until an operator runs this suite and attaches results.
