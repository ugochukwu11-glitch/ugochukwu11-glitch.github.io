import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '.env');

try {
  const envFile = await readFile(ENV_PATH, 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
} catch (error) {
  // Local .env is optional. Hosted environments can provide variables directly.
}

const PORT = Number(process.env.PORT || 8787);
const MODEL = 'gemini-3.1-flash-live-preview';
const VOICE_NAME = process.env.GEMINI_VOICE_NAME || 'Zephyr';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

let knowledgeCache = {
  loadedAt: 0,
  text: '',
};

function sendJson(response, statusCode, payload, origin = '') {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    Vary: 'Origin',
  });
  response.end(JSON.stringify(payload));
}

function isAllowedOrigin(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

async function readKnowledgeBase() {
  if (process.env.PORTFOLIO_KNOWLEDGE_TEXT?.trim()) {
    return process.env.PORTFOLIO_KNOWLEDGE_TEXT.trim();
  }

  const cacheAgeMs = Date.now() - knowledgeCache.loadedAt;
  if (knowledgeCache.text && cacheAgeMs < 60_000) {
    return knowledgeCache.text;
  }

  const configuredPath = process.env.PORTFOLIO_KNOWLEDGE_PATH || '../about.md';
  const resolvedPath = path.resolve(__dirname, configuredPath);
  const fileText = await readFile(resolvedPath, 'utf8');
  knowledgeCache = {
    loadedAt: Date.now(),
    text: fileText.trim(),
  };
  return knowledgeCache.text;
}

function buildSystemInstruction(knowledgeBase) {
  return [
    "You are Kelvin Anowu's portfolio voice assistant.",
    'Answer questions only with the portfolio knowledge provided below.',
    'If a visitor asks about something not covered, say that clearly and invite them to contact Kelvin directly.',
    'Keep responses concise, accurate, and confident.',
    'Present Kelvin as a data scientist, AI automation builder, data engineer, and web scraping specialist.',
    '',
    'Private portfolio knowledge base:',
    knowledgeBase,
  ].join('\n');
}

async function createLiveToken() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const knowledgeBase = await readKnowledgeBase();
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model: MODEL,
        config: {
          responseModalities: ['AUDIO'],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          temperature: 0.5,
          sessionResumption: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: VOICE_NAME,
              },
            },
          },
          systemInstruction: {
            parts: [{ text: buildSystemInstruction(knowledgeBase) }],
          },
        },
      },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });

  return {
    token: token.name,
    model: MODEL,
    voiceName: VOICE_NAME,
    expiresAt: expireTime,
    newSessionExpiresAt: newSessionExpireTime,
  };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, { error: 'Origin not allowed.' }, '');
      return;
    }

    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      Vary: 'Origin',
    });
    response.end();
    return;
  }

  if (request.url === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, service: 'portfolio-gemini-live-backend' }, origin || '*');
    return;
  }

  if (request.url === '/api/gemini/live-token' && request.method === 'POST') {
    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, { error: 'Origin not allowed.' }, '');
      return;
    }

    try {
      const payload = await createLiveToken();
      sendJson(response, 200, payload, origin || '*');
    } catch (error) {
      sendJson(
        response,
        500,
        {
          error: 'Failed to create Gemini Live token.',
          detail: error instanceof Error ? error.message : 'Unknown server error.',
        },
        origin || '*'
      );
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' }, origin || '*');
});

server.listen(PORT, () => {
  console.log(`Gemini Live backend listening on http://localhost:${PORT}`);
});
