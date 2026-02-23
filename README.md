# Fitness App

React + Vite workout app with AI coaching and voice-to-plan flow.

## Local Development (Bun)

```bash
bun install
bun run dev
```

## Production Build (Bun)

```bash
bun run lint
bun run build
```

## Serverless Backend

This repo includes Netlify Functions endpoints:

- `POST /api/ai/chat`
- `POST /api/ai/transcribe`

The frontend calls these endpoints directly, so API keys are not exposed in browser code.

## Required Server Environment Variables

Set these in Netlify (Site configuration -> Environment variables):

- `MISTRAL_API_KEY` (required for planner generation)
- `OPENROUTER_API_KEY` (required for AI coach feedback/next-step prompts)
- `GROQ_API_KEY` (required for voice transcription)

Optional:

- `MISTRAL_MODEL` (default: `mistral-small-latest`)
- `GROQ_TRANSCRIPTION_MODEL` (default: `whisper-large-v3-turbo`)
- `GROQ_TRANSCRIPTION_LANGUAGE` (default: `en`)
- `OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`)

## Deploy (Netlify)

1. Push this repo to GitHub.
2. Import the repo in Netlify.
3. Keep detected framework as Vite.
4. Add the environment variables above.
5. Deploy.

After deploy, open the Netlify URL on your phone using cellular data.
