# Cleartable — The Calm GTD App

A personal productivity application inspired by David Allen's Getting Things Done methodology, with AI-powered task processing.

**Live at:** cleartable.app
**Methodology reference:** Built on the principles of Getting Things Done® (a registered trademark of the David Allen Company; Cleartable is not affiliated with or endorsed by DAC).

## Features

- **Inbox**: Quick capture for unprocessed items
- **Next Actions**: Clear, actionable tasks organized by context
- **Projects**: Multi-step outcomes with linked tasks
- **Waiting For**: Track delegated items
- **Someday/Maybe**: Ideas for the future
- **AI Assistant**: Groq + OpenAI-powered task categorization and prioritization (Groq Llama-3.3-70B for fast capture, OpenAI as fallback + advisory)

## Setup

### Prerequisites
- Node.js 18+
- OpenAI API key (for AI features + fallback)
- Groq API key (optional — primary for Smart Capture; falls back to OpenAI if unset). Free, no card, at console.groq.com

### Installation

1. **Install server dependencies:**
```bash
cd server
npm install
```

2. **Install client dependencies:**
```bash
cd client
npm install
```

3. **Set up environment variables:**
```bash
export OPENAI_API_KEY=your_api_key_here
export GROQ_API_KEY=your_groq_key_here   # optional; primary for Smart Capture
```
See `server/.env.example` for the full list (DATABASE_URL, Google OAuth, AI usage caps, etc.).

### Running the App

1. **Start the server:**
```bash
cd server
npm run dev
```

2. **Start the client (in a new terminal):**
```bash
cd client
npm run dev
```

3. Open http://localhost:5173 in your browser

## GTD Workflow

1. **Capture** everything into the Inbox
2. **Clarify** what each item means and what action is required
3. **Organize** items into appropriate lists
4. **Reflect** on your system regularly
5. **Engage** with your tasks confidently

## AI Features

- **Smart Capture**: Fast natural-language parse of every quick capture (Groq Llama-3.3-70B)
- **Process Inbox**: AI categorizes inbox items into appropriate GTD lists
- **Daily Focus**: AI suggests which tasks should be your priority today
- **Project Breakdown**: AI suggests next actions for your projects
- **Weekly Review**: AI analyzes system health and flags stale items

Note: AI requires `OPENAI_API_KEY` (used as the fallback for every call, and primary for advisory ops). `GROQ_API_KEY` is optional but recommended — it's the fast/free primary for Smart Capture and the objective ops; without it those transparently fall back to OpenAI. All AI calls are usage-metered (see `PROJECT_KNOWLEDGE.md` Build Backlog #4).
