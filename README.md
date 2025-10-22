# 🧠 ORA — Personal AI Memory Engine

> “An assistant that *remembers what matters.*”  
>  
> ORA é um **motor de memória semântica** construído em **Node.js + OpenAI + PostgreSQL**, capaz de **registrar, buscar e responder** com base em lembranças pessoais — o primeiro passo para um assistente verdadeiramente contextual.

---

![Node](https://img.shields.io/badge/node-%3E%3D18.0-green)
![Express](https://img.shields.io/badge/express-4.x-blue)
![PostgreSQL](https://img.shields.io/badge/postgres-14.x-336791)
![OpenAI](https://img.shields.io/badge/OpenAI-API-orange)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)

---

## 🚀 Funcionalidades

✅ Armazena “memórias” com embeddings semânticos  
✅ Busca por **significado**, não por palavra exata  
✅ Gera **respostas em linguagem natural** baseadas nas memórias  
✅ Persistência em PostgreSQL (com suporte a vetores)  
✅ Arquitetura modular e pronta para escalar (Supabase, Prisma, etc.)

---

## 🧩 Arquitetura

ora-proto/
│
├── src/
│ ├── routes/ # Endpoints REST (event, search, respond)
│ ├── db/ # Conexão e schema
│ ├── utils/ # Funções auxiliares (cosineSimilarity, format)
│ ├── services/ # Lógica de embeddings e GPT
│ └── config/ # Env, constantes, etc.
│
├── client/ # (futuro) Painel React / Chat UI
├── prisma/ # (futuro) ORM Prisma
│
├── docker-compose.yml # PostgreSQL local
├── package.json
└── README.md

---

## ⚙️ Instalação

### 1️⃣ Clonar o projeto
```bash
git clone https://github.com/<seu-usuario>/ora.git
cd ora
```

### 2️⃣ Configurar ambiente
Crie o arquivo .env:
DATABASE_URL=postgresql://ora:ora123@localhost:5432/ora
OPENAI_API_KEY=sk-...
PORT=3000

### 3️⃣ Subir o banco (Docker)
```bash
docker-compose up -d
```

### 4️⃣ Rodar a API
```bash
npm install
npm run dev
```

---

## 🔌 Endpoints

### 🧠 Criar memória
POST /api/v1/device/event

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "text": "Conversei com o João sobre o projeto da semana que vem."
}
```

---

### 🔍 Busca semântica
POST /api/v1/device/search

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que combinei com o João?"
}
```

---

### 💬 Resposta contextual
POST /api/v1/device/respond

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "query": "O que combinei com o João?"
}
```

Exemplo de retorno:

```json
{
  "query": "O que combinei com o João?",
  "answer": "Você combinou com João de revisar o projeto na segunda-feira.",
  "top_results": [...]
}
```

---

### 🧭 Roadmap

| Fase | Nome                 | Objetivo                             | Status          |
| ---- | -------------------- | ------------------------------------ | --------------- |
| 1    | 🧠 MVP semântico     | Entender e responder por significado | ✅ Concluído     |
| 2    | 🧩 Memória viva      | Contexto, histórico e forget API     | 🧠 Em andamento |
| 3    | 💻 Interface         | Dashboard e Chat UI                  | ⏳ Planejado     |
| 4    | ☁️ Supabase + Deploy | Escalabilidade e CI/CD               | ⏳ Planejado     |
| 5    | 🤖 ORA 2.0           | Agente pró-ativo e multimodal        | ⏳ Futuro        |

---

### 🤖 Tecnologias

| Área              | Ferramenta               |
| ----------------- | ------------------------ |
| Linguagem         | Node.js (ES Modules)     |
| Framework         | Express                  |
| Banco             | PostgreSQL (Docker)      |
| Embeddings        | `text-embedding-3-small` |
| IA conversacional | `gpt-4o-mini`            |
| ORM (futuro)      | Prisma                   |
| Frontend (futuro) | React + Tailwind         |
| Infra (futuro)    | Supabase + Railway       |

--- 

### 🧠 Visão

>O ORA é um experimento em memória artificial pessoal — um sistema capaz de lembrar conversas, contextos e decisões para auxiliar humanos a pensar melhor.
>
>Imagine um assistente que não apenas responde, mas lembra.

---

### 👨‍💻 Desenvolvido por
Edgar Brito — Software Developer
💬 “Building the foundation for personal memory.”

---

### 🧩 Como contribuir

Fork o repositório

Crie uma branch (feat/<feature-name>)

Faça suas alterações

Envie um Pull Request com uma descrição clara

<!-- ### 🛠️ Licença

MIT © 2025 — Desenvolvido por Edgar Brito -->