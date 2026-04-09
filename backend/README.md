# Gemini Live Backend

This backend mints short-lived Gemini Live ephemeral tokens for the portfolio voice widget and keeps the private knowledge base on the server.

## Why it exists

GitHub Pages can host the static portfolio UI, but it cannot safely hold a Gemini API key or private knowledge. This backend solves that by:

- keeping the API key server-side
- reading private portfolio knowledge from a local file or environment variable
- creating constrained ephemeral tokens for Gemini Live

## Endpoints

- `GET /api/health`
- `POST /api/gemini/live-token`

## Environment

Copy `.env.example` into `.env` on your server and fill in:

- `GEMINI_API_KEY`
- `ALLOWED_ORIGINS`
- `PORTFOLIO_KNOWLEDGE_PATH` or `PORTFOLIO_KNOWLEDGE_TEXT`

`about.md` is intentionally ignored by git, so it stays private.

## Run locally

```bash
cd backend
npm install
npm start
```

Then point the frontend widget to your backend URL with:

```html
<script>
  window.VOICE_AGENT_TOKEN_ENDPOINT = "https://your-backend.example.com/api/gemini/live-token";
</script>
```
