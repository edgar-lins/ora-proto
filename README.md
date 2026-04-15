# ORA — Personal AI Memory Engine

> Semantic memory engine for personal AI — stores, retrieves and responds based on meaning using vector embeddings, GPT-4o-mini and full voice I/O.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![Express](https://img.shields.io/badge/Express-5.1-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-orange)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Status](https://img.shields.io/badge/status-in%20development-yellow)

---

## What is ORA?

ORA is a personal memory engine that gives AI assistants real, persistent context. Instead of forgetting everything between sessions, ORA stores what you tell it — as semantic vector embeddings — and retrieves the most relevant memories to answer your questions accurately.

No hallucinations. If there's no confident context, ORA says so instead of making something up.

**Key capabilities:**
- Store personal memories with automatic enrichment (summary + tags via GPT)
- Semantic search by meaning, not keywords
- Contextual responses grounded in your actual memories
- Anti-hallucination guardrails (similarity threshold)
- Full voice I/O — speak in, get a spoken response back
- Persistent conversation history per user

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 5.1 |
| Database | PostgreSQL 16 (Docker) |
| Embeddings | `text-embedding-3-small` |
| Chat | `gpt-4o-mini` |
| Transcription | `gpt-4o-mini-transcribe` / `whisper-1` (fallback) |
| TTS | `gpt-4o-mini-tts` |
| Frontend | React 19 + Vite + Tailwind CSS |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/edgar-lins/ora-proto.git
cd ora-proto

# Set up environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Start the database
docker compose up -d

# Install dependencies and initialize the schema
npm install
node src/db/init.js

# Start the server
npm run dev
```

### Dashboard (Frontend)

```bash
cd ora-dashboard
npm install
npm run dev
```

Dashboard available at `http://localhost:5173`.

---

## Environment Variables

See `.env.example` for the full list. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` | OpenAI API key |
| `PORT` | Server port (default: `3000`) |
| `BASE_URL` | Public base URL of this server — used for internal route-to-route calls (default: `http://localhost:3000`) |
| `TRANSCRIBE_MODEL` | Audio transcription model (default: `gpt-4o-mini-transcribe`) |

---

## Project Structure

```
ora-proto/
├── src/
│   ├── server.js                   # Entry point
│   ├── db/
│   │   ├── index.js                # PostgreSQL connection pool
│   │   └── init.js                 # Schema initialization (run once)
│   ├── utils/
│   │   ├── openaiClient.js         # Shared OpenAI client singleton
│   │   └── math.js                 # cosineSimilarity + generateEmbedding
│   └── routes/
│       ├── device.js               # Create memory + reprocess
│       ├── memories.js             # List, search, delete memories
│       ├── memoryAuto.js           # Auto-save Q&A as memory
│       ├── contextResponder.js     # Contextual response with guardrails ⭐
│       ├── contextRetriever.js     # Retrieve top-K relevant memories
│       ├── contextBuilder.js       # Build context block from memories
│       ├── conversationContext.js  # Save and retrieve conversation history
│       ├── voice.js                # Audio upload → transcription → memory
│       ├── speak.js                # Text → MP3 audio (TTS)
│       ├── speakRespond.js         # Query → contextual response → audio
│       ├── speakConverse.js        # Audio in → transcription → response → audio out
│       └── voiceLoop.js            # Full voice loop with auto memory
│
├── ora-dashboard/                  # React frontend
│   └── src/
│       ├── api.js                  # Centralized API_BASE and USER_ID constants
│       ├── pages/
│       │   ├── Chat.jsx            # Chat interface
│       │   └── Memories.jsx        # Memory list and semantic search
│       └── layouts/
│           └── DashboardLayout.jsx
│
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## API Reference

Base URL: `http://localhost:3000`

All endpoints accept and return JSON, except audio endpoints which return `audio/mpeg`.

### Memories

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/device/event` | Create a manual memory |
| `GET` | `/api/v1/device/memories/list/:user_id` | List 50 most recent memories |
| `POST` | `/api/v1/device/memories/search` | Semantic search |
| `DELETE` | `/api/v1/device/memories/:id` | Delete a memory |
| `POST` | `/api/v1/device/memories/reprocess` | Re-enrich memories with missing summary/tags |
| `POST` | `/api/v1/memory/auto` | Auto-save a Q&A pair as memory |

### Context & Responses

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/device/context/respond` | Contextual response with guardrails ⭐ |
| `POST` | `/api/v1/device/context/retrieve` | Retrieve top-K relevant memories |
| `POST` | `/api/v1/device/context/build` | Build formatted context block |
| `POST` | `/api/v1/conversation/save` | Save a conversation turn |
| `GET` | `/api/v1/conversation/context/:user_id` | Get last 5 conversation turns |

### Voice & Audio

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/device/voice` | Upload audio → transcribe → save as memory |
| `POST` | `/api/v1/device/speak` | Text → MP3 audio (TTS) |
| `POST` | `/api/v1/device/speak/respond` | Query → contextual response → audio |
| `POST` | `/api/v1/device/speak/converse` | Audio in → transcribe → respond → audio out |
| `POST` | `/api/v1/voice/loop` | Full voice loop with automatic memory |

---

### Example: Create a memory

```http
POST /api/v1/device/event
Content-Type: application/json

{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "content": "Had a call with João about the project deadline — he needs the report by Friday."
}
```

```json
{
  "status": "ok",
  "memory_id": "b3f1...",
  "summary": "Call with João about project deadline",
  "tags": ["#João", "#Deadline", "#Project"]
}
```

### Example: Ask a question

```http
POST /api/v1/device/context/respond
Content-Type: application/json

{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "When does João need the report?"
}
```

```json
{
  "status": "ok",
  "answer": "João needs the report by Friday.",
  "context_used": "(1) Call with João about project deadline",
  "conversation_used": []
}
```

If no confident memory exists, ORA responds honestly:
> *"I couldn't find reliable details in my memories about that. Could you remind me?"*

---

## Database Schema

```sql
memories (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  summary     TEXT,
  tags        TEXT[],
  type        TEXT,         -- 'manual' | 'auto' | 'voice-loop'
  voice_used  TEXT,
  metadata    JSONB,
  embedding   JSONB,        -- text-embedding-3-small vector
  created_at  TIMESTAMP
)

conversation_history (
  id         UUID PRIMARY KEY,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL, -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at TIMESTAMP
)

conversation_logs (
  id            UUID PRIMARY KEY,
  user_id       TEXT NOT NULL,
  query         TEXT,
  answer        TEXT,
  memories_used JSONB,
  created_at    TIMESTAMP
)
```

The init script uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so it's safe to run on an existing database.

---

## Roadmap

| Phase | Name | Description | Status |
|---|---|---|---|
| 1 | Semantic MVP | Store and search by meaning | ✅ Done |
| 2 | Live Memory | Context, history and guardrails | ✅ Done |
| 3 | Interface | Dashboard and Chat UI | ✅ Done (v1) |
| 4 | Deploy | Supabase / Railway + CI/CD | ⏳ Planned |
| 5 | ORA 2.0 | Proactive agent, multimodal | ⏳ Future |

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit your changes
4. Open a pull request with a clear description

---

Built by [Edgar Brito](https://github.com/edgar-lins) — *"Building the foundation for personal memory."*
