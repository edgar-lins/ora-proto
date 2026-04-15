# ORA — Personal AI Memory Engine

> "An assistant that remembers what matters."

ORA é um motor de memória semântica pessoal. Ele armazena o que você vive, aprende e decide — e usa isso para responder com contexto real, não com achismos. Construído em Node.js com embeddings vetoriais e GPT-4o-mini, com suporte completo a voz.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 5.1 |
| Banco de dados | PostgreSQL 16 (Docker) |
| Embeddings | `text-embedding-3-small` (OpenAI) |
| IA conversacional | `gpt-4o-mini` |
| Transcrição | `gpt-4o-mini-transcribe` / `whisper-1` (fallback) |
| TTS | `gpt-4o-mini-tts` |
| Frontend | React 19 + Vite + Tailwind CSS |

---

## Instalação

### Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- Chave de API da OpenAI

### Setup

```bash
# 1. Clone o repositório
git clone https://github.com/edgar-lins/ora-proto.git
cd ora-proto

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env e preencha sua OPENAI_API_KEY

# 3. Suba o banco de dados
docker compose up -d

# 4. Instale as dependências e inicialize o schema
npm install
node src/db/init.js

# 5. Inicie o servidor
npm run dev
```

### Frontend (Dashboard)

```bash
cd ora-dashboard
npm install
npm run dev
```

O dashboard estará disponível em `http://localhost:5173`.

---

## Variáveis de Ambiente

Consulte `.env.example` para a lista completa. As essenciais:

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | String de conexão PostgreSQL | — |
| `OPENAI_API_KEY` | Chave da API OpenAI | — |
| `PORT` | Porta do servidor | `3000` |
| `BASE_URL` | URL base do servidor (para chamadas internas entre rotas) | `http://localhost:3000` |
| `TRANSCRIBE_MODEL` | Modelo de transcrição de áudio | `gpt-4o-mini-transcribe` |

---

## Estrutura do Projeto

```
ora-proto/
├── src/
│   ├── server.js                  # Entry point — monta rotas e middleware
│   ├── db/
│   │   ├── index.js               # Pool de conexão PostgreSQL
│   │   └── init.js                # Inicialização do schema (rodar uma vez)
│   ├── utils/
│   │   ├── openaiClient.js        # Singleton do cliente OpenAI
│   │   └── math.js                # cosineSimilarity + generateEmbedding
│   └── routes/
│       ├── device.js              # Criar memória manual + reprocessar
│       ├── memories.js            # Listar, buscar e deletar memórias
│       ├── memoryAuto.js          # Salvar memória automática de Q&A
│       ├── search.js              # Busca semântica (legado)
│       ├── respond.js             # Resposta contextual (legado)
│       ├── contextBuilder.js      # Montar bloco de contexto
│       ├── contextRetriever.js    # Recuperar top-K memórias relevantes
│       ├── contextResponder.js    # Resposta com guardrails anti-alucinação
│       ├── context.js             # Reset de contexto (placeholder)
│       ├── conversationContext.js # Salvar e recuperar histórico de conversa
│       ├── voice.js               # Upload de áudio → transcrição → memória
│       ├── speak.js               # Texto → áudio MP3 (TTS)
│       ├── speakRespond.js        # Query → resposta contextual → áudio
│       ├── speakConverse.js       # Áudio in → transcrição → resposta → áudio out
│       └── voiceLoop.js           # Loop completo de voz com memória automática
│
├── ora-dashboard/                 # Frontend React
│   └── src/
│       ├── api.js                 # Constantes centralizadas (API_BASE, USER_ID)
│       ├── App.jsx
│       ├── layouts/
│       │   └── DashboardLayout.jsx
│       └── pages/
│           ├── Chat.jsx           # Interface de chat
│           └── Memories.jsx       # Listagem e busca de memórias
│
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## API Reference

Base URL: `http://localhost:3000`

Todos os endpoints aceitam e retornam JSON, exceto os de áudio que retornam `audio/mpeg`.

---

### Memórias

#### Criar memória manual

```http
POST /api/v1/device/event
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "content": "Conversei com o João sobre o projeto na sexta.",
  "metadata": {}
}
```

Resposta:
```json
{
  "status": "ok",
  "memory_id": "uuid",
  "summary": "Conversa com João sobre projeto",
  "tags": ["#Projeto", "#João"]
}
```

> Memórias triviais (menos de 5 palavras, "ok", "sim", etc.) são rejeitadas automaticamente.
> O enriquecimento (resumo + tags) é gerado automaticamente via GPT.

---

#### Listar memórias

```http
GET /api/v1/device/memories/list/:user_id
```

Retorna até 50 memórias mais recentes.

---

#### Busca semântica

```http
POST /api/v1/device/memories/search
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que combinei com o João?"
}
```

Retorna até 10 memórias ordenadas por similaridade semântica.

---

#### Deletar memória

```http
DELETE /api/v1/device/memories/:id
```

---

#### Reprocessar memórias antigas

```http
POST /api/v1/device/memories/reprocess
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "limit": 10,
  "dry_run": false
}
```

Gera resumo e tags para memórias que ainda não foram enriquecidas.
Com `dry_run: true`, apenas simula sem salvar.

---

#### Salvar memória automática de Q&A

```http
POST /api/v1/memory/auto
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que era o projeto?",
  "answer": "Era o sistema de relatórios do cliente X.",
  "context_used": true
}
```

---

### Contexto e Respostas

#### Resposta contextual com guardrails ⭐

```http
POST /api/v1/device/context/respond
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que combinei com o João?"
}
```

Resposta:
```json
{
  "status": "ok",
  "query": "O que combinei com o João?",
  "answer": "Você combinou de revisar o projeto na sexta-feira.",
  "context_used": "(1) Conversa com João sobre projeto\n(2) ...",
  "conversation_used": [...]
}
```

Este é o endpoint principal de chat. Possui:
- Busca semântica nas memórias do usuário
- Histórico dos últimos 5 turnos de conversa
- Guardrail anti-alucinação: se a similaridade máxima for menor que 0.35, responde que não encontrou contexto confiável em vez de inventar

---

#### Recuperar memórias relevantes

```http
POST /api/v1/device/context/retrieve
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "reunião com clientes",
  "limit": 5
}
```

---

#### Montar bloco de contexto

```http
POST /api/v1/device/context/build
```

Mesmo payload do retrieve. Retorna as memórias já formatadas como bloco de texto.

---

### Histórico de Conversa

#### Salvar turno

```http
POST /api/v1/conversation/save
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "role": "user",
  "content": "Qual era o prazo?"
}
```

O histórico mantém apenas os últimos 5 turnos por usuário.

---

#### Recuperar histórico

```http
GET /api/v1/conversation/context/:user_id
```

---

### Voz e Áudio

#### Transcrever áudio e salvar como memória

```http
POST /api/v1/device/voice
Content-Type: multipart/form-data
```

| Campo | Tipo | Descrição |
|---|---|---|
| `audio` | File | Arquivo de áudio (.mp3, .m4a, .wav...) |
| `user_id` | String | ID do usuário |
| `language` | String | (opcional) Código de idioma, ex: `pt` |

Tamanho máximo: 25MB. Usa `gpt-4o-mini-transcribe` com fallback para `whisper-1`.

---

#### Texto para fala

```http
POST /api/v1/device/speak
```

```json
{
  "text": "Você combinou de revisar o projeto na sexta.",
  "voice": "alloy"
}
```

Retorna: `audio/mpeg`

---

#### Query → resposta contextual → áudio

```http
POST /api/v1/device/speak/respond
```

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que tenho hoje?",
  "voice": "alloy"
}
```

Retorna: `audio/mpeg` com headers `X-ORA-Answer` (resposta em texto, URL-encoded).

---

#### Áudio in → áudio out (conversa por voz)

```http
POST /api/v1/device/speak/converse
Content-Type: multipart/form-data
```

| Campo | Tipo |
|---|---|
| `audio` | File |
| `user_id` | String |
| `voice` | String (opcional) |

Retorna: `audio/mpeg` com headers `X-ORA-Transcript` e `X-ORA-Answer`.

---

#### Loop completo de voz com memória automática

```http
POST /api/v1/voice/loop
Content-Type: multipart/form-data
```

Mesmo formato do `speak/converse`. Adicionalmente salva a troca como memória automática no banco.

---

### Endpoints Legados

Mantidos para compatibilidade. Prefira os endpoints de `context/` para novos usos.

| Endpoint | Descrição |
|---|---|
| `POST /api/v1/device/search` | Busca semântica simples (top 5) |
| `POST /api/v1/device/respond` | Resposta contextual sem histórico de conversa |

---

## Schema do Banco

```sql
-- Memórias semânticas
memories (
  id          UUID PRIMARY KEY,
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  summary     TEXT,
  tags        TEXT[],
  type        TEXT,          -- 'manual' | 'auto' | 'voice-loop'
  voice_used  TEXT,
  metadata    JSONB,
  embedding   JSONB,         -- vetor text-embedding-3-small
  created_at  TIMESTAMP
)

-- Histórico de conversa (últimos 5 turnos)
conversation_history (
  id         UUID PRIMARY KEY,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,  -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at TIMESTAMP
)

-- Log de respostas geradas
conversation_logs (
  id            UUID PRIMARY KEY,
  user_id       TEXT NOT NULL,
  query         TEXT,
  answer        TEXT,
  memories_used JSONB,
  created_at    TIMESTAMP
)
```

Para inicializar ou atualizar o schema em um banco existente:

```bash
node src/db/init.js
```

O script usa `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, sendo seguro rodar em bancos já populados.

---

## Dashboard

Interface React disponível em `ora-dashboard/`. Acesse após rodar `npm run dev` dentro da pasta.

| Página | Funcionalidade |
|---|---|
| Chat | Conversa em tempo real com o ORA usando o pipeline de contexto |
| Memórias | Listagem, busca semântica e exclusão de memórias |
| Configurações | Em desenvolvimento |

Para customizar a URL da API ou o usuário padrão, crie um `ora-dashboard/.env` baseado em `ora-dashboard/.env.example`.

---

## Roadmap

| Fase | Nome | Objetivo | Status |
|---|---|---|---|
| 1 | MVP Semântico | Armazenar e buscar por significado | ✅ Concluído |
| 2 | Memória Viva | Contexto, histórico e guardrails | ✅ Concluído |
| 3 | Interface | Dashboard e Chat UI | ✅ Concluído (v1) |
| 4 | Deploy | Supabase / Railway + CI/CD | ⏳ Planejado |
| 5 | ORA 2.0 | Agente pró-ativo e multimodal | ⏳ Futuro |

---

## Desenvolvido por

Edgar Brito — Software Developer

> "Building the foundation for personal memory."
