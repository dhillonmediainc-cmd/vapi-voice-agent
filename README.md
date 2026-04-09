# Harnoor Voice Assistant - VAPI Agent

Call a phone number > talk to your AI assistant > it creates tasks in Notion, sends emails, and manages your workflow automatically.

## Quick Start

### 1. Get API Keys

- **VAPI**: https://dashboard.vapi.ai (Settings > API Keys)
- **Notion**: https://www.notion.so/my-integrations (Internal integration token)
- **Gmail**: https://myaccount.google.com/apppasswords (App password, enable 2FA first)

### 2. Setup

```bash
cd vapi-voice-agent
cp .env.example .env
# Edit .env with your API keys
npm install
```

### 3. Deploy

**Render (recommended)**
1. Push to GitHub
2. Connect repo at https://render.com
3. Set environment variables
4. Deploy

### 4. What It Does

When you call your number:

- "Add a task to follow up with Harman about 3 Eyes Cargo" > Creates a Notion task
- "Email john@example.com about the property listing" > Sends an email
- "Make me a checklist: file Arsh tax, file Jatan tax" > Creates a Notion checklist
- "What do I have in Notion about the website launch?" > Searches Notion
- "Remind me to call Ashwind at 3pm" > Creates a reminder task

## Architecture

Phone Call > VAPI > Your Server > Notion API / Gmail

## Test APIs

```bash
curl -X POST http://localhost:3000/api/create-task -H "Content-Type: application/json" -d '{"title": "Test task", "company": "Guided Home Realty", "priority": "high"}'
```

## Costs

- VAPI: ~$0.05/min (first $10 free)
- Phone number: $1.50/mo
- Render: Free tier works
- Total: Under $5/month
