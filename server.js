require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Client } = require("@notionhq/client");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// âââ Notion Client ââââââââââââââââââââââââââââââââââââââââââ
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const WORKSPACE_ID = process.env.NOTION_WORKSPACE_ID || "32c97d3c-50ab-8000-83b8-da69918852de";

// âââ Email Transport ââââââââââââââââââââââââââââââââââââââââ
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// âââ Function Definitions (sent to VAPI) ââââââââââââââââââââ
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "create_notion_task",
      description: "Create a new task or page in Notion under Harnoor's workspace. Use this when Harnoor says things like 'add a task', 'remind me to', 'create a page for', 'note down', etc.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the task or page",
          },
          content: {
            type: "string",
            description: "The body content or details of the task. Can include checklist items separated by newlines.",
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "medium", "low"],
            description: "Priority level of the task",
          },
          company: {
            type: "string",
            enum: [
              "Guided Home Realty",
              "DhillonMedia Inc",
              "3 Eyes Cargo",
              "S D Freightway",
              "786 Kabob House",
              "Personal",
            ],
            description: "Which company this task belongs to",
          },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format, if mentioned",
          },
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
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content",
          },
          from_name: {
            type: "string",
            description: "Which company/identity to send from. Defaults to Harnoor Dhillon.",
            enum: [
              "Harnoor Dhillon",
              "Guided Home Realty",
              "DhillonMedia Inc",
              "3 Eyes Cargo",
              "S D Freightway",
            ],
          },
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
          title: {
            type: "string",
            description: "Title of the checklist",
          },
          items: {
            type: "array",
            items: { type: "string" },
            description: "List of checklist items",
          },
          company: {
            type: "string",
            enum: [
              "Guided Home Realty",
              "DhillonMedia Inc",
              "3 Eyes Cargo",
              "S D Freightway",
              "786 Kabob House",
              "Personal",
            ],
            description: "Which company this belongs to",
          },
        },
        required: ["title", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notion",
      description: "Search Harnoor's Notion workspace for existing pages, tasks, or notes. Use when he asks 'what do I have about', 'find my notes on', 'look up', etc.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find in Notion",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quick_reminder",
      description: "Set a quick reminder by creating a high-priority Notion task with a specific time. Use when Harnoor says 'remind me at', 'don't let me forget', etc.",
      parameters: {
        type: "object",
        properties: {
          reminder: {
            type: "string",
            description: "What to be reminded about",
          },
          time: {
            type: "string",
            description: "When to be reminded (e.g., '6pm today', 'tomorrow morning')",
          },
        },
        required: ["reminder"],
      },
    },
  },
];

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// FUNCTION HANDLERS â Execute the actual work
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function handleCreateNotionTask({ title, content, priority, company, due_date }) {
  try {
    const children = [];

    // Add priority callout
    if (priority) {
      const priorityEmoji = { urgent: "\u{1F6A8}", high: "\u{1F525}", medium: "\u{1F4CB}", low: "\u{1F4AD}" };
      children.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: priorityEmoji[priority] || "\u{1F4CB}" },
          rich_text: [{ type: "text", text: { content: `Priority: ${priority.toUpperCase()}${company ? ` | Company: ${company}` : ""}${due_date ? ` | Due: ${due_date}` : ""}` } }],
        },
      });
    }

    // Add content as paragraphs
    if (content) {
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: line } }],
          },
        });
      }
    }

    const page = await notion.pages.create({
      parent: { type: "page_id", page_id: WORKSPACE_ID },
      icon: { type: "emoji", emoji: "\u{2705}" },
      properties: {
        title: [{ type: "text", text: { content: title } }],
      },
      children: children.length > 0 ? children : undefined,
    });

    return {
      success: true,
      message: `Task "${title}" created in Notion${company ? ` under ${company}` : ""}.${priority ? ` Priority: ${priority}.` : ""}`,
      pageId: page.id,
    };
  } catch (err) {
    console.error("Notion create error:", err.message);
    return { success: false, message: `Failed to create task: ${err.message}` };
  }
}
async function handleSendEmail({ to, subject, body, from_name }) {
  try {
    const senderName = from_name || "Harnoor Dhillon";
    await transporter.sendMail({
      from: `"${senderName}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
    return { success: true, message: `Email sent to ${to} with subject "${subject}".` };
  } catch (err) {
    console.error("Email error:", err.message);
    return { success: false, message: `Failed to send email: ${err.message}` };
  }
}

async function handleCreateNotionChecklist({ title, items, company }) {
  try {
    const children = [];

    if (company) {
      children.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "\u{1F3E2}" },
          rich_text: [{ type: "text", text: { content: `Company: ${company}` } }],
        },
      });
    }

    for (const item of items) {
      children.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: item } }],
          checked: false,
        },
      });
    }

    const page = await notion.pages.create({
      parent: { type: "page_id", page_id: WORKSPACE_ID },
      icon: { type: "emoji", emoji: "\u{1F4DD}" },
      properties: {
        title: [{ type: "text", text: { content: title } }],
      },
      children,
    });

    return {
      success: true,
      message: `Checklist "${title}" created with ${items.length} items.`,
      pageId: page.id,
    };
  } catch (err) {
    console.error("Notion checklist error:", err.message);
    return { success: false, message: `Failed to create checklist: ${err.message}` };
  }
}

async function handleSearchNotion({ query }) {
  try {
    const response = await notion.search({
      query,
      page_size: 5,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });

    if (response.results.length === 0) {
      return { success: true, message: `No results found for "${query}".`, results: [] };
    }

    const results = response.results.map((page) => {
      const title =
        page.properties?.title?.[0]?.text?.content ||
        page.properties?.Name?.title?.[0]?.text?.content ||
        "Untitled";
      return { title, id: page.id, lastEdited: page.last_edited_time };
    });

    const summaryLines = results.map((r, i) => `${i + 1}. ${r.title}`);
    return {
      success: true,
      message: `Found ${results.length} results for "${query}":\n${summaryLines.join("\n")}`,
      results,
    };
  } catch (err) {
    console.error("Notion search error:", err.message);
    return { success: false, message: `Search failed: ${err.message}` };
  }
}

async function handleQuickReminder({ reminder, time }) {
  const title = `\u{23F0} Reminder: ${reminder}`;
  const content = time ? `Reminder set for: ${time}\n\n${reminder}` : reminder;
  return handleCreateNotionTask({ title, content, priority: "high" });
}

// Map function names to handlers
const FUNCTION_MAP = {
  create_notion_task: handleCreateNotionTask,
  send_email: handleSendEmail,
  create_notion_checklist: handleCreateNotionChecklist,
  search_notion: handleSearchNotion,
  quick_reminder: handleQuickReminder,
};
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// VAPI WEBHOOK ENDPOINTS
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", agent: "Harnoor Voice Assistant", version: "1.0.0" });
});

// Main VAPI webhook â handles all message types
app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "No message in request body" });
  }

  console.log(`[VAPI] Event: ${message.type}`);

  switch (message.type) {
    // âââ Assistant Request (VAPI asks for assistant config) âââ
    case "assistant-request":
      return res.json(getAssistantConfig());

    // âââ Function Call (VAPI executes a tool) ââââââââââââââââ
    case "function-call":
      return await handleFunctionCall(message, res);

    // âââ Status Updates ââââââââââââââââââââââââââââââââââââââ
    case "status-update":
      console.log(`[VAPI] Status: ${message.status?.status}`);
      return res.json({});

    // âââ End of Call Report ââââââââââââââââââââââââââââââââââ
    case "end-of-call-report":
      console.log(`[VAPI] Call ended. Duration: ${message.endedReason}`);
      // Optionally log the transcript to Notion
      if (message.transcript) {
        try {
          await handleCreateNotionTask({
            title: `\u{1F4DE} Voice Call Log â ${new Date().toLocaleDateString()}`,
            content: message.summary || message.transcript,
            priority: "low",
          });
        } catch (e) {
          console.error("Failed to log call:", e.message);
        }
      }
      return res.json({});

    // âââ Conversation Update âââââââââââââââââââââââââââââââââ
    case "conversation-update":
      return res.json({});

    // âââ Hang (keep-alive) âââââââââââââââââââââââââââââââââââ
    case "hang":
      return res.json({});

    default:
      console.log(`[VAPI] Unhandled event type: ${message.type}`);
      return res.json({});
  }
});

// Handle function calls from VAPI
async function handleFunctionCall(message, res) {
  const functionCall = message.functionCall;
  if (!functionCall) {
    return res.status(400).json({ error: "No functionCall in message" });
  }

  const { name, parameters } = functionCall;
  console.log(`[VAPI] Function call: ${name}`, JSON.stringify(parameters));

  const handler = FUNCTION_MAP[name];
  if (!handler) {
    return res.json({
      result: JSON.stringify({ success: false, message: `Unknown function: ${name}` }),
    });
  }

  try {
    const result = await handler(parameters);
    console.log(`[VAPI] Function result:`, result.message);
    return res.json({ result: JSON.stringify(result) });
  } catch (err) {
    console.error(`[VAPI] Function error:`, err.message);
    return res.json({
      result: JSON.stringify({ success: false, message: `Error: ${err.message}` }),
    });
  }
}
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// ASSISTANT CONFIGURATION
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function getAssistantConfig() {
  return {
    assistant: {
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.7,
        messages: [{ role: "system", content: SYSTEM_PROMPT }],
      },
      voice: {
        provider: "11labs",
        voiceId: "pNInz6obpgDQGcFmaJgB",
      },
      firstMessage:
        "Yo Harnoor, what's good? I'm your voice assistant. Tell me what you need â tasks, emails, reminders, whatever. I got you.",
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en",
      },
      serverUrl: process.env.SERVER_URL || "http://localhost:3000/vapi/webhook",
      endCallMessage: "Alright boss, everything's been handled. Check your Notion. Peace!",
    },
  };
}

const SYSTEM_PROMPT = `You are Harnoor Dhillon's personal AI voice assistant. Harnoor runs 5 companies:

1. **Guided Home Realty** â Real estate brokerage (launching April 11, 2026)
2. **DhillonMedia Inc** â Digital marketing agency
3. **3 Eyes Cargo** â Freight/trucking logistics
4. **S D Freightway** â Freight brokerage
5. **786 Kabob House** â Restaurant

KEY PEOPLE:
- Ashwinder/Ashwind â Business partner/employee, handles operations
- Harman â 3 Eyes Cargo partner, based in Tracy, CA
- Tina â Logistics contact for 3 Eyes Cargo
- Arsh, Jatan, Jaspal, Gurj â People whose taxes Harnoor files

YOUR PERSONALITY:
- Talk like a real one. Keep it professional but chill â Harnoor is a young entrepreneur grinding hard.
- Be direct and efficient. Don't waste his time with fluff.
- When he gives you tasks, confirm them quickly and execute.
- If something is unclear, ask once â don't keep going back and forth.

YOUR CAPABILITIES:
- Create tasks and pages in Notion (his central hub)
- Send emails on his behalf from any of his companies
- Create checklists in Notion
- Search his existing Notion workspace
- Set reminders

RULES:
1. Always confirm what you're about to do before executing: "Got it, I'll create a task for X in Notion under Y company. That right?"
2. If Harnoor mentions a company context, tag the task to that company.
3. For emails, always confirm the recipient, subject, and key points before sending.
4. If he's venting about stress, be supportive but keep it brief â then ask "what can I knock off your plate right now?"
5. Log every call summary to Notion automatically.
6. Priorities: If he says "urgent" or "asap" or "tonight" â mark it urgent. "This week" = high. Everything else = medium.

TONE: Like a capable executive assistant who also happens to be a homie. Professional when needed (emails), casual in conversation.`;

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// DIRECT API ENDPOINTS (for testing without VAPI)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

app.post("/api/create-task", async (req, res) => {
  const result = await handleCreateNotionTask(req.body);
  res.json(result);
});

app.post("/api/send-email", async (req, res) => {
  const result = await handleSendEmail(req.body);
  res.json(result);
});

app.post("/api/create-checklist", async (req, res) => {
  const result = await handleCreateNotionChecklist(req.body);
  res.json(result);
});

app.post("/api/search", async (req, res) => {
  const result = await handleSearchNotion(req.body);
  res.json(result);
});

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// START SERVER
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
ââââââââââââââââââââââââââââââââââââââââââââââââââââ
â  Harnoor Voice Assistant Server                  â
â  Running on port ${PORT}                            â
â                                                  â
â  Webhook: POST /vapi/webhook                     â
â  Health:  GET  /                                 â
â                                                  â
â  Test APIs:                                      â
â  POST /api/create-task                           â
â  POST /api/send-email                            â
â  POST /api/create-checklist                      â
â  POST /api/search                                â
ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  `);
});

module.exports = app;
