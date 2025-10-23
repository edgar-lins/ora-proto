# 🧠 ORA — Personal AI Memory Engine

> "An assistant that *remembers what matters.*"

ORA é um **motor de memória semântica** que permite criar um assistente pessoal com memória contextual persistente. Construído com tecnologias modernas, ele é capaz de armazenar, recuperar e responder baseado em lembranças pessoais de forma natural e contextualizada.

## ⚡ Stack Tecnológico

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-5.1-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-8.16-336791)
![OpenAI](https://img.shields.io/badge/OpenAI-API-orange)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)

## 🎯 Principais Recursos

- 🧠 **Memória Semântica**
  - Armazena memórias usando embeddings vetoriais
  - Busca por significado contextual, não apenas palavras-chave
  - Persistência eficiente em PostgreSQL

- 🤖 **IA Contextual**
  - Integração com OpenAI para processamento de linguagem natural
  - Respostas personalizadas baseadas no histórico
  - Compreensão contextual das interações

- 🔄 **Arquitetura Escalável**
  - API RESTful com Express
  - Suporte a vetores no PostgreSQL
  - Estrutura modular pronta para expansão

## 🛠️ Instalação

### Pré-requisitos

- Node.js 18 ou superior
- Docker e Docker Compose
- Chave de API da OpenAI

### Configuração

1. **Clone o repositório**
   ```bash
   git clone https://github.com/edgar-lins/ora-proto.git
   cd ora-proto
   ```

2. **Configure as variáveis de ambiente**
   ```bash
   # Crie um arquivo .env com:
   DATABASE_URL=postgresql://ora:ora123@localhost:5432/ora
   OPENAI_API_KEY=sua_chave_aqui
   PORT=3000
   ```

3. **Inicie o banco de dados**
   ```bash
   docker-compose up -d
   ```

4. **Instale as dependências e inicie a API**
   ```bash
   npm install
   npm run dev
   ```

## � API Endpoints

### Criar Memória
```http
POST /api/v1/device/event
Content-Type: application/json

{
    "user_id": "00000000-0000-0000-0000-000000000001",
    "text": "Conversei com o João sobre o projeto da semana que vem."
}
```

### Buscar Memórias
```http
POST /api/v1/device/search
Content-Type: application/json

{
    "user_id": "00000000-0000-0000-0000-000000000001",
    "query": "O que combinei com o João?"
}
```

### Obter Resposta Contextual
```http
POST /api/v1/device/respond
Content-Type: application/json

{
    "user_id": "00000000-0000-0000-0000-000000000001",
    "query": "Lembre-me dos detalhes da conversa com o João"
}
```

## 🔧 Estrutura do Projeto

```
ora-proto/
├── src/
│   ├── routes/      # Rotas da API
│   ├── db/          # Configuração do banco
│   └── utils/       # Utilitários
├── docker-compose.yml
└── package.json
```

## � Licença

Este projeto está sob a licença ISC. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👥 Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.
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