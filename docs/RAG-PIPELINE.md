# AskPDF — RAG Pipeline & Project Flow

A **Retrieval-Augmented Generation (RAG)** chat app: users upload a PDF and ask
questions about it. Answers are grounded strictly in the uploaded document —
the model is instructed to refuse anything not found in the retrieved context.

This document describes the **entire project flow**, the **pre-existing
features**, and the **changes made in the guest-mode / auto-persist / Docker
work** (currently uncommitted).

---

## 1. Tech Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth | Clerk (`@clerk/nextjs`) — **optional** (guests allowed) |
| Database | MongoDB via Mongoose |
| Vector store | Pinecone (index `bharat-llm`) |
| Embeddings | Google Gemini `gemini-embedding-001` |
| LLM | Google Gemini `gemini-2.5-flash` (streaming + non-streaming) |
| Orchestration | LangChain (history-aware retriever + stuff-documents chain) |
| Streaming | Vercel AI SDK (`@ai-sdk/react` `useChat` + `LangChainAdapter`) |
| Client state | Redux Toolkit |
| Styling | Tailwind CSS + Radix UI |

---

## 2. High-Level Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              Browser (React)                 │
                         │  /c/[chatid]  ──  useChat()  ──  Redux store  │
                         └───────┬───────────────┬─────────────┬────────┘
                                 │ upload PDF     │ ask question│ read history
                                 ▼                ▼             ▼
                     ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐
                     │ /api/upload   │  │ /api/chat    │  │ /api/getHistory  │
                     │ (ingestion)   │  │ (query)      │  │ /api/getchat     │
                     └──────┬────────┘  └──────┬───────┘  │ /api/savechat    │
                            │                  │          └────────┬─────────┘
              chunk + embed │      retrieve +  │ generate           │ CRUD
                            ▼                  ▼                    ▼
                     ┌──────────────────────────────┐      ┌──────────────┐
                     │        Pinecone index         │      │   MongoDB    │
                     │  vectors tagged {userId,      │      │  Chat docs   │
                     │  chatId, pdfId}               │      │  by useremail│
                     └──────────────────────────────┘      └──────────────┘
                            ▲                  ▲
                            └── Gemini embeddings / LLM ──┘
```

There are **two independent pipelines**:

1. **Ingestion** (`/api/upload`): PDF → chunks → embeddings → Pinecone.
2. **Query** (`/api/chat`): question → retrieve matching chunks → LLM answer →
   token stream → auto-persist to MongoDB.

---

## 3. Two Identities (important)

The app scopes data with **two different identifiers**:

| Identifier | Used for | Source |
|---|---|---|
| `userId` | Pinecone vector scoping (upload + retrieval) | Clerk `auth()` **or** guest id |
| `useremail` | MongoDB document key (history/persistence) | Clerk email **or** guest id |

- **Authenticated user:** `userId` = Clerk user id; `useremail` = Clerk email.
- **Guest:** both are the same synthetic **`guest_<uuid>`** (see §7).

`chatId` (URL `/c/{chatId}`) and `chatNumber` (a conversation within a user's
document) further scope a single conversation.

---

## 4. Data Model

### MongoDB — `Chat` collection (`src/model/Chat.ts`)

One document per user (`useremail`), holding all their conversations:

```ts
Chat {
  chatId:   string          // the initial /c/{id} value
  useremail: string         // identity key for all Mongo queries
  userType: "guest" | "authenticated"   // ← added this session
  ArrayOfChats: [
    {
      chatNumber: string    // one conversation
      messages: [ { id, role: "user"|"assistant", content } ]
    }
  ]
}
```

### Pinecone — vectors (`src/lib/pdf-processor.ts`)

Each PDF chunk is stored with metadata used as the retrieval filter:

```ts
metadata: { pdfId, userId, chatId }
```

### Redux (`src/lib/features`)

- `chat.history` — the sidebar's conversation list (`Chat[]`).
- `chatData` — `chatId`, `chatNumber`, `messages`, `bulkIds` (current chat).

---

## 5. Request Flows

### 5.1 Routing & Auth (`src/middleware.ts`)

- Public routes: `/`, `/sign-in`, `/sign-up`.
- **Authenticated** user hitting a public page → redirected to a fresh
  `/c/{Date.now()}`.
- **Guest** (no Clerk session) hitting `/` → also redirected to `/c/{Date.now()}`.
- `/c/*` and the sign-in/up pages are reachable **without auth** (guests welcome).

> Auth is optional. Previously the middleware bounced every signed-out visitor to
> `/sign-in`; now guests flow straight into the chat.

### 5.2 Ingestion — PDF Upload (`/api/upload`)

1. Client (`page.tsx → handleFileSelect`) sends `pdfFile`, `pdfId`
   (`Date.now()+filename`), `chatId`, and (for guests) `guestId` as multipart form data.
2. `/api/upload/route.ts`:
   - `userId = Clerk auth() ?? guestId` (401 if neither).
   - `getChunkedDocsFromPDF()` — `PDFLoader` extracts text →
     `RecursiveCharacterTextSplitter` (chunk 1000, overlap 200) → attaches
     `{ pdfId, userId, chatId }` metadata to each chunk.
   - `embedAndStoreDocs()` — `GoogleGenerativeAIEmbeddings`
     (`gemini-embedding-001`, `RETRIEVAL_DOCUMENT`) → `PineconeStore.fromDocuments`
     writes vectors into index `bharat-llm`.

### 5.3 Query — Ask a Question (`/api/chat`)

1. Client `useChat()` submits messages with `data: { chatId, guestId? }`.
2. `/api/chat/route.ts`:
   - `userId = Clerk auth() ?? data.guestId` (401 if neither).
   - Extracts the latest message as `question` and the prior turns as `chatHistory`.
   - Calls `callChain({ question, userId, chatId, chatHistory })`.
3. `callChain()` (`src/lib/langchain.ts`):
   - Short-circuits greetings ("hi/hello") with a canned reply.
   - `getVectorStore()` → `PineconeStore.fromExistingIndex`.
   - **Retrieval filter** = `{ userId: {$eq}, chatId: {$eq} }` — isolates
     retrieval to *this user's PDFs in this chat* (prevents cross-user/cross-PDF leakage).
   - `createHistoryAwareRetriever` (uses `nonStreamingModel` +
     `STANDALONE_QUESTION_TEMPLATE` to rephrase follow-ups into standalone questions)
     retrieves top-10 chunks.
   - If **no chunks** → replies "you haven't uploaded a PDF in this chat yet".
   - `createStuffDocumentsChain` (uses `streamingModel` + `QA_TEMPLATE`) generates
     the answer **grounded only in the retrieved context**, streamed token-by-token.
4. `LangChainAdapter.toDataStreamResponse(stream)` streams tokens back; the UI
   renders them live with a pulsing cursor (`chat-line.tsx`).

#### How Pinecone finds "similar" chunks (vector similarity search)

The retriever step (`vectorStore.asRetriever(10, retrievalFilter)` in
`langchain.ts`) is where the actual semantic search happens. It works in three
stages:

**1. Embed the query.** The user's (rephrased, standalone) question is a string —
Pinecone can't compare it to stored PDF chunks directly. So the same
`GoogleGenerativeAIEmbeddings` model used at ingestion converts the question into
a **query vector**: a fixed-length list of floats that captures its *meaning*, not
its exact words. Because the PDF chunks were embedded with the same model, the
question and the chunks live in the **same vector space**, so their positions are
comparable.

```
"What is the refund policy?"  ──embed──▶  [0.021, -0.44, 0.13, … ]  (query vector)
PDF chunk "Refunds are issued within 30 days…"  ──already embedded──▶  [0.019, -0.41, 0.15, …]
```

**2. Search by distance, not keywords.** Pinecone compares the query vector
against every stored chunk vector using a **similarity metric** (cosine
similarity / dot product). Vectors that point in a similar direction score higher
— meaning the texts are semantically close **even if they share no words**
("refund policy" matches "money back guarantee"). To do this fast over millions
of vectors, Pinecone uses **Approximate Nearest Neighbour (ANN)** indexing rather
than scanning everything, trading a tiny bit of accuracy for large speed gains.

**3. Filter + top-K.** Before ranking, the **metadata filter**
`{ userId: {$eq}, chatId: {$eq} }` restricts the search to vectors belonging to
*this user's PDF in this chat* — so results can never leak across users, chats, or
other PDFs. Pinecone then returns the **top 10** closest chunks
(`asRetriever(10, …)`).

Those 10 chunks become the `{context}` block injected into `QA_TEMPLATE`, and the
LLM answers **only** from that context. In short:

```
question ──embed──▶ query vector ──(cosine + ANN, filtered by userId/chatId)──▶ top-10 chunks ──▶ LLM context
```

> Note: retrieval quality depends entirely on this step. If the closest chunks
> don't contain the answer, the model is instructed to say it couldn't find it
> rather than hallucinate.

#### LangChain's role — and how the PDF context reaches the LLM

**LangChain is the orchestration layer that glues embeddings → Pinecone → prompt
→ LLM together.** It doesn't store data or run the model itself; it wires the
pieces into a repeatable chain and handles the format conversions between them. In
this app it provides three things (all in `src/lib/langchain.ts`):

1. **`PineconeStore` (vector store wrapper)** — bundles the Pinecone index with
   the Gemini embedding model so a query string can be embedded and searched in one
   call. `.asRetriever(10, filter)` exposes it as a *retriever*.
2. **`createHistoryAwareRetriever`** — takes the chat history + the new follow-up,
   uses the `nonStreamingModel` + `STANDALONE_QUESTION_TEMPLATE` to rewrite it into
   a self-contained question, then runs the retrieval.
3. **`createStuffDocumentsChain`** — takes the retrieved chunks, "stuffs" their
   **text** into the prompt's `{context}` slot, and calls the `streamingModel`.

**The key question: are vectors passed to the LLM? No.** LLMs consume **text**,
not vectors. Embeddings exist *only* to power the similarity search inside
Pinecone. Here's the round-trip and the data type at every hop:

```
INGESTION (once, per PDF)
  PDF text ─▶ Document{ pageContent: "…text…", metadata } ─▶ embed ─▶ vector [floats]
  Pinecone stores:  vector  +  metadata { text: "…the original chunk text…", userId, chatId, pdfId }
                                          └── kept because PineconeStore is configured with textKey: "text"

QUERY (every question)
  question (string)
     └─▶ embed ─▶ query vector [floats]
             └─▶ Pinecone ANN search (cosine, filtered) ─▶ top-10 matches
                     └─▶ LangChain reads each match's `text` metadata
                             └─▶ rebuilds Document{ pageContent: "…chunk text…" }   ← back to TEXT
                                     └─▶ stuffed into {context} of QA_TEMPLATE
                                             └─▶ final PLAIN-TEXT prompt ─▶ Gemini LLM ─▶ streamed answer
```

So the vectors are the **search key only**. Once Pinecone returns the nearest
matches, LangChain pulls the **original chunk text** (which was saved alongside
each vector as the `text` metadata field — that's what `textKey: "text"` in
`gemini-embeddings.ts` configures) and reconstructs LangChain `Document` objects
whose `pageContent` is that text. The retrieved *vectors themselves are discarded*
at this point.

**What the LLM actually receives** is a single assembled text prompt built by
`createStuffDocumentsChain` from `QA_TEMPLATE`:

```
System: You are an enthusiastic AI assistant. Use ONLY the following pieces of context…
Context:
  <text of retrieved chunk 1>
  <text of retrieved chunk 2>
  … (up to 10 chunks concatenated) …
Human: <the user's standalone question>
```

The model reads that plain text and generates the answer, streamed token-by-token
back through `LangChainAdapter`. In one line:

> **Embeddings/vectors are used only to *find* the right PDF chunks; those chunks'
> original *text* is what LangChain concatenates into the prompt and sends to the
> LLM — the LLM never sees a vector.**

### 5.4 Persistence

- Conversations live in one Mongo document per `useremail`; `/api/savechat`
  find-or-creates the doc and appends messages to the right `chatNumber`.
- `/api/getHistory` (list) and `/api/getchat` (single) read by `useremail`.
- `/api/saveuser` creates the initial doc on sign-up.

---

## 6. Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | build + runtime (public) | Clerk client — **inlined at build time** |
| `CLERK_SECRET_KEY` | runtime | Clerk server |
| `MONGODB_URI` | runtime | MongoDB connection |
| `GEMINI_API_KEY` | runtime | Embeddings + LLM |
| `PINECONE_API_KEY` | runtime | Vector store |

---

## 7. Changes Made This Session (uncommitted)

### 7.1 Guest mode (optional auth)

Guests can use the full chat without signing in.

- **`src/lib/guest.ts`** *(new)* — `getGuestId()` mints a `guest_<uuid>` stored in
  `sessionStorage`. Stable **within a browsing session** (so upload → retrieval →
  sidebar all share one id) but **fresh on a new visit** — a returning guest is a
  brand-new guest and never sees prior conversations.
- **`middleware.ts`** — stopped redirecting signed-out visitors to `/sign-in`;
  guests land in a chat instead.
- **`api/chat` + `api/upload`** — accept `guestId` as the vector-scope id when
  there's no Clerk session (`effectiveUserId = userId ?? guestId`).
- **`model/Chat.ts`** — added `userType: "guest" | "authenticated"` (default
  `authenticated`); guest docs are tagged `guest`.
- **`api/savechat`** — persists `userType` on document creation.
- **`page.tsx`** — derives a guest identity when signed out, shows a **Sign in**
  button for guests (`SignedOut`), and sends `guestId` on chat + upload requests.

> **Result:** a guest's conversation is saved to MongoDB with `userType: "guest"`,
> but on their next visit they get a new id → they never load old chats.

### 7.2 Double-save bug fix

**Symptom:** the same conversation appeared twice in the sidebar.

**Cause:** the message-sync effect included Redux `savedMessages` in both its
dedup set and its dependency array. When `saveNewChat` called `clearMessage()`,
`savedMessages` emptied, the effect re-ran, and since `useChat` still held the
messages they were **re-added** — the next save wrote them again.

**Fix:** dedup with a `useRef<Set<string>>` (`persistedIds`) that survives
`clearMessage()` but resets on navigation. Loaded (already-saved) messages are
seeded into it so appends never rewrite history. Removed the now-dead
`bulkIds`/`savedMessages` selector.

### 7.3 Auto-persist after each assistant reply

Previously conversations were saved only when the user clicked **New Chat**.
Now every completed exchange is written straight to the DB.

- **`page.tsx`** — when `status === "ready"`, new messages are POSTed to
  `/api/savechat` under a **stable `conversationNumber` = `search ?? params.chatid`**,
  forcing the append path so all replies accumulate in one conversation. A shared
  `refreshHistory` updates the sidebar live; failed saves un-mark ids to retry.
- **`app-sidebar.tsx`** — removed its own save logic (the double-save source);
  "New Chat" / history clicks now just navigate. Reads history from Redux.
- **`api/savechat`** — append now uses `$push { $each: messages }` so a batch of
  messages is stored individually instead of nested as one element.

> **Result:** guest (and authenticated) conversations auto-persist even if the
> user closes the tab without clicking anything.

### 7.4 Active-conversation highlight

- The sidebar highlights the ongoing conversation
  (`eachchat.chatNumber === searchparam`), fed `search ?? params.chatid` so a
  brand-new chat highlights too.
- Styled **purple** (`bg-purple-400`, hover `bg-purple-500`, `text-white`) on the
  `SidebarMenuButton` — applied to the button (not the item) so it wins over the
  default `hover:bg-sidebar-accent`.

### 7.5 Deployment (Docker + CI)

- **`next.config.ts`** — `output: "standalone"` for a lean runtime image.
- **`Dockerfile`** — 3-stage `node:22-alpine` build (deps → build → runner),
  non-root user, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as a build arg (inlined at
  build), runtime secrets injected at `docker run`.
- **`.dockerignore`** — excludes `node_modules`, `.next`, `.env*`, `.git`, etc.
- **`.github/workflows/ci.yml`** — `build` job (lint + build on push/PR) and
  `docker` job (build & push to GHCR on `master`, with GHA layer cache).

---

## 8. Key Files Reference

| File | Role |
|---|---|
| `src/middleware.ts` | Auth gate & routing (guest-aware) |
| `src/app/c/[chatid]/page.tsx` | Chat UI, streaming, auto-persist, guest identity |
| `src/components/app-sidebar.tsx` | Conversation list + active highlight |
| `src/app/api/upload/route.ts` | PDF ingestion entry |
| `src/app/api/chat/route.ts` | Query entry (retrieval + generation) |
| `src/app/api/savechat/route.ts` | Conversation persistence |
| `src/lib/pdf-processor.ts` | PDF load + chunk + tag metadata |
| `src/lib/gemini-embeddings.ts` | Embeddings + Pinecone store |
| `src/lib/langchain.ts` | RAG chain (retriever + QA) |
| `src/lib/llm.ts` | Gemini model config |
| `src/lib/prompt-template.ts` | Standalone-question + QA prompts |
| `src/lib/guest.ts` | Guest identity (new) |
| `src/model/Chat.ts` | Mongoose schema (`userType` added) |
```
