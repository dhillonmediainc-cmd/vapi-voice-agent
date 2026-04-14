require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Client } = require("@notionhq/client");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// --- Notion Client ---
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const WORKSPACE_ID = process.env.NOTION_WORKSPACE_ID || "32c97d3c-50ab-8000-83b8-da69918852de";
const TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID || "63397d3c-50ab-82ca-9a7e-01ea0ccd0e52";
const SHARED_LIFE_OS_PAGE_ID = process.env.NOTION_PAGE_ID || "04a97d3c-50ab-8352-b8e6-811528be548e";

// Map company names to Notion Business select options
const BUSINESS_MAP = {
  "3 eyes cargo": "3 Eyes Cargo",
  "3eyes": "3 Eyes Cargo",
  "three eyes": "3 Eyes Cargo",
  "sd freightway": "S D Freightway",
  "s d freightway": "S D Freightway",
  "sd freight": "S D Freightway",
  "dhillonmedia": "DhillonMedia",
  "dhillon media": "DhillonMedia",
  "personal": "Personal/Admin",
  "admin": "Personal/Admin",
  "guided home realty": "Personal/Admin",
  "guided home": "Personal/Admin",
};

function mapBusiness(company) {
  if (!company) return null;
  const key = company.toLowerCase().trim();
  return BUSINESS_MAP[key] || company;
}

function mapPriority(priority) {
  if (!priority) return null;
  const p = priority.toLowerCase().trim();
  if (p === "urgent" || p === "high") return "High Priority ";
  if (p === "medium") return "Medium Priority ";
  if (p === "low") return "Low Priority ";
  return "Medium Priority ";
}

// --- Email Transport ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// --- Function Definitions (sent to VAPI) ---
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "create_notion_task",
      description: "Create a new task or page in Notion under Harnoor's workspace. Use this when Harnoor says things like 'add a task', 'remind me to', 'create a page for', 'note down', etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The title of the task or page" },
          content: { type: "string", description: "The body content or details of the task. Can include checklist items separated by newlines." },
          priority: { type: "string", enum: ["urgent", "high", "medium", "low"], description: "Priority level of the task" },
          company: { type: "string", enum: ["Guided Home Realty", "DhillonMedia Inc", "3 Eyes Cargo", "S D Freightway", "786 Kabob House", "Personal"], description: "Which company this task belongs to" },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format, if mentioned" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email on behalf of Harnoor. Use when he says 'email someone', 'send a message to', 'write an email', etc.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content" },
          from_name: { type: "string", description: "Which company/identity to send from. Defaults to Harnoor Dhillon.", enum: ["Harnoor Dhillon", "Guided Home Realty", "DhillonMedia Inc", "3 Eyes Cargo", "S D Freightway"] },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_notion_checklist",
      description: "Create a checklist page in Notion with multiple items. Use when Harnoor lists out multiple things to do.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the checklist" },
          items: { type: "array", items: { type: "string" }, description: "List of checklist items" },
          company: { type: "string", enum: ["Guided Home Realty", "DhillonMedia Inc", "3 Eyes Cargo", "S D Freightway", "786 Kabob House", "Personal"], description: "Which company this belongs to" },
        },
        required: ["title", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notion",
      description: "Search Harnoor's Notion workspace for existing pages, tasks, or notes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to find in Notion" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quick_reminder",
      description: "Set a quick reminder by creating a high-priority Notion task with a specific time.",
      parameters: {
        type: "object",
        properties: {
          reminder: { type: "string", description: "What to be reminded about" },
          time: { type: "string", description: "When to be reminded" },
        },
        required: ["reminder"],
      },
    },
  },
];

// === FUNCTION HANDLERS ===

async function handleCreateNotionTask({ title, content, priority, company, due_date }) {
  try {
    const properties = {
      Task: { title: [{ type: "text", text: { content: title } }] },
      Status: { status: { name: "Not started" } },
    };
    const mappedPriority = mapPriority(priority);
    if (mappedPriority) properties.Priority = { select: { name: mappedPriority } };
    const mappedBusiness = mapBusiness(company);
    if (mappedBusiness) properties.Business = { select: { name: mappedBusiness } };
    if (due_date) properties.Date = { date: { start: due_date } };
    if (content) properties.Description = { rich_text: [{ type: "text", text: { content: content } }] };
    const page = await notion.pages.create({ parent: { type: "database_id", database_id: TASKS_DB_ID }, properties });
    return { success: true, message: `Task "${title}" created in Notion${company ? ` under ${company}` : ""}.${priority ? ` Priority: ${priority}.` : ""}`, pageId: page.id };
  } catch (err) {
    console.error("Notion create error:", err.message);
    return { success: false, message: `Failed to create task: ${err.message}` };
  }
}

async function handleSendEmail({ to, subject, body, from_name }) {
  try {
    const senderName = from_name || "Harnoor Dhillon";
    await transporter.sendMail({ from: `"${senderName}" <${process.env.SMTP_USER}>`, to, subject, text: body, html: body.replace(/\n/g, "<br>") });
    return { success: true, message: `Email sent to ${to} with subject "${subject}".` };
  } catch (err) {
    console.error("Email error:", err.message);
    return { success: false, message: `Failed to send email: ${err.message}` };
  }
}

async function handleCreateNotionChecklist({ title, items, company }) {
  try {
    const children = [];
    if (company) children.push({ object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "\ud83c\udfe2" }, rich_text: [{ type: "text", text: { content: `Company: ${company}` } }] } });
    for (const item of items) children.push({ object: "block", type: "to_do", to_do: { rich_text: [{ type: "text", text: { content: item } }], checked: false } });
    const page = await notion.pages.create({ parent: { type: "page_id", page_id: SHARED_LIFE_OS_PAGE_ID }, icon: { type: "emoji", emoji: "\ud83d\udcdd" }, properties: { title: [{ type: "text", text: { content: title } }] }, children });
    return { success: true, message: `Checklist "${title}" created with ${items.length} items.`, pageId: page.id };
  } catch (err) {
    console.error("Notion checklist error:", err.message);
    return { success: false, message: `Failed to create checklist: ${err.message}` };
  }
}

async function handleSearchNotion({ query }) {
  try {
    const response = await notion.search({ query, page_size: 5, sort: { direction: "descending", timestamp: "last_edited_time" } });
    if (response.results.length === 0) return { success: true, message: `No results found for "${query}".`, results: [] };
    const results = response.results.map((page) => {
      const title = page.properties?.title?.[0]?.text?.content || page.properties?.Name?.title?.[0]?.text?.content || "Untitled";
      return { title, id: page.id, lastEdited: page.last_edited_time };
    });
    const summaryLines = results.map((r, i) => `${i + 1}. ${r.title}`);
    return { success: true, message: `Found ${results.length} results for "${query}":\n${summaryLines.join("\n")}`, results };
  } catch (err) {
    console.error("Notion search error:", err.message);
    return { success: false, message: `Search failed: ${err.message}` };
  }
}

async function handleQuickReminder({ reminder, time }) {
  const title = `\u23f0 Reminder: ${reminder}`;
  const content = time ? `Reminder set for: ${time}\n\n${reminder}` : reminder;
  return handleCreateNotionTask({ title, content, priority: "high" });
}

const FUNCTION_MAP = {
  create_notion_task: handleCreateNotionTask,
  send_email: handleSendEmail,
  create_notion_checklist: handleCreateNotionChecklist,
  search_notion: handleSearchNotion,
  quick_reminder: handleQuickReminder,
};

// === VAPI WEBHOOK ENDPOINTS ===

app.get("/", (req, res) => {
  res.json({ status: "ok", agent: "Harnoor Voice Assistant", version: "1.0.0" });
});

app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "No message in request body" });
  console.log(`[VAPI] Event: ${message.type}`);
  switch (message.type) {
    case "assistant-request": return res.json(getAssistantConfig());
    case "function-call": return await handleFunctionCall(message, res);
    case "status-update": console.log(`[VAPI] Status: ${message.status?.status}`); return res.json({});
    case "end-of-call-report":
      console.log(`[VAPI] Call ended. Duration: ${message.endedReason}`);
      if (message.transcript) {
        try { await handleCreateNotionTask({ title: `\ud83d\udcde Voice Call Log - ${new Date().toLocaleDateString()}`, content: message.summary || message.transcript, priority: "low" }); } catch (e) { console.error("Failed to log call:", e.message); }
      }
      return res.json({});
    case "conversation-update": return res.json({});
    case "hang": return res.json({});
    default: console.log(`[VAPI] Unhandled event type: ${message.type}`); return res.json({});
  }
});

async function handleFunctionCall(message, res) {
  const functionCall = message.functionCall;
  if (!functionCall) return res.status(400).json({ error: "No functionCall in message" });
  const { name, parameters } = functionCall;
  console.log(`[VAPI] Function call: ${name}`, JSON.stringify(parameters));
  const handler = FUNCTION_MAP[name];
  if (!handler) return res.json({ result: JSON.stringify({ success: false, message: `Unknown function: ${name}` }) });
  try {
    const result = await handler(parameters);
    console.log(`[VAPI] Function result:`, result.message);
    return res.json({ result: JSON.stringify(result) });
  } catch (err) {
    console.error(`[VAPI] Function error:`, err.message);
    return res.json({ result: JSON.stringify({ success: false, message: `Error: ${err.message}` }) });
  }
}

// === ASSISTANT CONFIGURATION ===

function getAssistantConfig() {
  return {
    assistant: {
      model: { provider: "openai", model: "gpt-4o", temperature: 0.7, messages: [{ role: "system", content: SYSTEM_PROMPT }] },
      voice: { provider: "11labs", voiceId: "pNInz6obpgDQGcFmaJgB" },
      firstMessage: "Yo Harnoor, what's good? I'm your voice assistant. Tell me what you need - tasks, emails, reminders, whatever. I got you.",
      transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
      serverUrl: process.env.SERVER_URL || "http://localhost:3000/vapi/webhook",
      endCallMessage: "Alright boss, everything's been handled. Check your Notion. Peace!",
    },
  };
}

const SYSTEM_PROMPT = `You are Harnoor Dhillon's personal AI voice assistant. Harnoor runs 5 companies:\n\n1. **Guided Home Realty** - Real estate brokerage (launching April 11, 2026)\n2. **DhillonMedia Inc** - Digital marketing agency\n3. **3 Eyes Cargo** - Freight/trucking logistics\n4. **S D Freightway** - Freight brokerage\n5. **786 Kabob House** - Restaurant\n\nKEY PEOPLE:\n- Ashwinder/Ashwind - Business partner/employee, handles operations\n- Harman - 3 Eyes Cargo partner, based in Tracy, CA\n- Tina - Logistics contact for 3 Eyes Cargo\n- Arsh, Jatan, Jaspal, Gurj - People whose taxes Harnoor files\n\nYOUR PERSONALITY:\n- Talk like a real one. Keep it professional but chill - Harnoor is a young entrepreneur grinding hard.\n- Be direct and efficient. Don't waste his time with fluff.\n- When he gives you tasks, confirm them quickly and execute.\n- If something is unclear, ask once - don't keep going back and forth.\n\nYOUR CAPABILITIES:\n- Create tasks and pages in Notion (his central hub)\n- Send emails on his behalf from any of his companies\n- Create checklists in Notion\n- Search his existing Notion workspace\n- Set reminders\n\nRULES:\n1. Always confirm what you're about to do before executing: "Got it, I'll create a task for X in Notion under Y company. That right?"\n2. If Harnoor mentions a company context, tag the task to that company.\n3. For emails, always confirm the recipient, subject, and key points before sending.\n4. If he's venting about stress, be supportive but keep it brief - then ask "what can I knock off your plate right now?"\n5. Log every call summary to Notion automatically.\n6. Priorities: If he says "urgent" or "asap" or "tonight" - mark it urgent. "This week" = high. Everything else = medium.\n\nTONE: Like a capable executive assistant who also happens to be a homie. Professional when needed (emails), casual in conversation.`;

// === DIRECT API ENDPOINTS (for testing) ===

app.post("/api/create-task", async (req, res) => { const result = await handleCreateNotionTask(req.body); res.json(result); });
app.post("/api/send-email", async (req, res) => { const result = await handleSendEmail(req.body); res.json(result); });
app.post("/api/create-checklist", async (req, res) => { const result = await handleCreateNotionChecklist(req.body); res.json(result); });
app.post("/api/search", async (req, res) => { const result = await handleSearchNotion(req.body); res.json(result); });

// === START SERVER ===

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Harnoor Voice Assistant Server running on port ${PORT}`);
  console.log(`Webhook: POST /vapi/webhook`);
  console.log(`Health: GET /`);
  console.log(`Test APIs: POST /api/create-task, /api/send-email, /api/create-checklist, /api/search`);
});

module.exports = app;
