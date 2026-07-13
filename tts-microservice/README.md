# DxAi TTS Microservice

Standalone FastAPI service for converting DxAi voice-agent text into MP3 audio.

## Run Locally

```bash
cd tts-microservice
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

The main backend stays on port 8000. This service runs independently on port 8001.

## Run with Docker

The service is fully containerized and cloud-ready (Render, Cloud Run, AWS, etc.).

```bash
cd tts-microservice
docker build -t dxai-tts .
docker run -p 8001:8001 --env-file .env dxai-tts
```

The image honours a platform-provided `$PORT` (defaults to `8001`), runs as a
non-root user, and ships a `HEALTHCHECK` against `/health`. A `render.yaml` is
included for one-click deployment to Render — set `TTS_API_KEY`, `GROQ_API_KEY`
and `SARVAM_API_KEY` as secrets in the dashboard.

## Resilience

- **Retry + exponential backoff** (`retry.py`): every upstream call (Sarvam,
  Groq, gTTS) is retried with jittered exponential backoff on transient errors
  (timeouts, connection drops, HTTP 429/5xx). Permanent errors such as 401/400
  are raised immediately. Tunable via `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_SECONDS`,
  `RETRY_MAX_SECONDS`.
- **Concurrency / queuing foundation** (`concurrency.py`): a bounded semaphore
  caps simultaneous upstream synthesis at `MAX_CONCURRENT_REQUESTS`. Excess
  requests queue up to `QUEUE_TIMEOUT_SECONDS`, then fail fast with `503` +
  `Retry-After` instead of overwhelming the providers' rate limits. Live counters
  are exposed under `/health` → `resilience.concurrency`.

## Tests

```bash
pip install -r requirements.txt
pytest
```

## Environment

Copy `.env.example` and fill in local values:

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"
```

`GROQ_API_KEY` enables Llama 3.3 70B script cleaning. Without it, the service uses the regex cleaner.

`SARVAM_API_KEY` enables Sarvam AI Bulbul V3 for `hin` and `hineng`. Without it, the service falls back to gTTS.

## API

### `POST /synthesize`

Header:

```http
X-API-Key: <TTS_API_KEY>
```

Request:

```json
{
  "text": "Dal makhani has about 420 calories in this serving.",
  "language": "eng"
}
```

Languages:

- `eng`: English, routed to gTTS.
- `hin`: Hindi, routed to Sarvam Bulbul V3 when configured.
- `hineng`: Hindi + English code-mixed text, routed to Sarvam Bulbul V3 when configured.

Response:

```json
{
  "audio_b64": "<base64 encoded mp3 string>",
  "audio_format": "mp3",
  "language": "eng",
  "script_used": "Dal makhani has about 420 calories in this serving."
}
```

## Test Request

```bash
curl -X POST http://localhost:8001/synthesize \
  -H "X-API-Key: $TTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"### Dal makhani has approx 347 kcal and 12.8g protein 😊","language":"eng"}'
```

## Tunnel Setup

With ngrok:

```bash
ngrok http 8001
```

With cloudflared:

```bash
cloudflared tunnel --url http://localhost:8001
```

Share the public tunnel URL as:

```text
https://<public-tunnel-host>/synthesize
```

and share the `TTS_API_KEY` value from `.env` with the caller.

## Decode Base64 Audio

The receiving service can decode `audio_b64` directly:

```python
import base64

audio_bytes = base64.b64decode(response["audio_b64"])
with open("tts_output.mp3", "wb") as f:
    f.write(audio_bytes)
```

## Provider Notes

- Script cleaning uses Groq `llama-3.3-70b-versatile` when available.
- Sarvam TTS uses `POST https://api.sarvam.ai/text-to-speech`, model `bulbul:v3`, `output_audio_codec=mp3`.
- Sarvam returns base64 audio; the service decodes it to bytes and re-encodes into the common response contract.
- gTTS is used for English and as the final fallback.
