# GTD Flow - Getting Things Done Productivity App

A personal productivity application based on David Allen's GTD methodology, with AI-powered task processing.

## Features

- **Inbox**: Quick capture for unprocessed items
- **Next Actions**: Clear, actionable tasks organized by context
- **Projects**: Multi-step outcomes with linked tasks
- **Waiting For**: Track delegated items
- **Someday/Maybe**: Ideas for the future
- **AI Assistant**: OpenAI-powered task categorization and prioritization

## Setup

### Prerequisites
- Node.js 18+
- OpenAI API key (for AI features)

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
```

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

- **Process Inbox**: AI categorizes inbox items into appropriate GTD lists
- **Daily Focus**: AI suggests which tasks should be your priority today
- **Project Breakdown**: AI suggests next actions for your projects

Note: AI features require a valid OpenAI API key set in the `OPENAI_API_KEY` environment variable.
