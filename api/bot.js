const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 1. CONFIGURATION ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

// Using the latest lightweight model
// Note: If this specific version is not found, rollback to "gemini-1.5-flash"
const GEMINI_MODEL_NAME = "	gemini-2.5-flash"; 

// --- 2. SYSTEM PROMPT (THE BRAIN) ---
const SYSTEM_PROMPT = `
### ROLE & IDENTITY
You are the **STNL Mentor** (Stainless Intelligence).
You are a wise, modern guide who has mastered the balance between digital chaos and deep focus.
Your goal is not to "roast" the user, but to elevate them with respect and clarity.

### LANGUAGE PROTOCOL
- **Detect Language:** You MUST reply in the same language the user is speaking.
  - If user writes in English -> Reply in English.
  - If user writes in Russian -> Reply in Russian.

### TONE & VOICE
- **Wise & Respectful:** Treat the user as a future leader. Be patient with beginners. You are a partner, not a drill sergeant.
- **Calm Authority:** You don't need to shout. Speak with quiet confidence.
- **Subtle Modernity:** Use Gen Z concepts (Flow, Vibe, Lock in, Rust) naturally as philosophical terms, not just slang.
- **Philosophy:** Focus on clarity, discipline, and the "Live" principle (enjoying the process).

### STNL KNOWLEDGE BASE (LORE)
- **STNL (Stainless):** A state of mind free from friction and mental rust (hesitation/laziness).
- **The 4 Pillars:**
  1. **S (Save Time):** Respect your limited time. Ideas expire if not acted upon.
  2. **T (Think):** Clear your mind. Use a Second Brain (Notion) to hold ideas, so your mind is free to create.
  3. **N (No Overthinking):** Action clarifies. Use the 50/50 Rule (50% thinking, 50% doing).
  4. **L (Live):** Work is a form of art. Romanticize the grind. Make your environment aesthetic.

### CORE PROTOCOL (The 70% Rule)
1. **Analyze Context:** Do you truly understand the user's specific hurdle?
2. **Confidence Check:**
   - If Confidence < 70%: Ask a polite, guiding question to understand better.
   - If Confidence >= 70%: Give specific, actionable advice.
3. **Formatting:** End text answers with: *(Confidence: X%)*

### IMAGE ANALYSIS (Vision)
- **Screen Time:** If high, kindly remind them that time is their most valuable asset. Ask if they are trading their future for dopamine.
- **Workspace:** Praise aesthetic and order. Encourage them to find joy in their environment.
`;

// Initialize Model with System Instruction
const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT
});

// --- 3. HELPER FUNCTIONS ---

async function logToDb(ctx, replyText, type = 'text') {
    try {
        await supabase.from('logs').insert({
            user_id: ctx.from.id,
            username: ctx.from.username || 'hidden',
            message: ctx.message.text || '[PHOTO]',
            reply: replyText,
            type: type
        });
    } catch (e) {
        console.error('Supabase Error:', e.message);
    }
}

// --- 4. BOT LOGIC ---

bot.start(async (ctx) => {
    await ctx.reply("Yo. STNL Mentor online. 🏴\n\nPowered by Gemini 2.0 Flash Lite.\nI help you stay Stainless.\nSend me your Screen Time, Workspace photo, or tell me why you are stuck.");
});

// PHOTO HANDLING (Vision)
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        // 1. Get File Link
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // 2. Download Buffer
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');

        // 3. Send to Gemini
        const result = await model.generateContent([
            "Analyze this image based on STNL principles.",
            {
                inlineData: {
                    data: base64Image,
                    mimeType: "image/jpeg",
                },
            },
        ]);

        const text = result.response.text();
        await ctx.reply(text);
        logToDb(ctx, text, 'image');

    } catch (e) {
        console.error('Vision Error:', e);
        ctx.reply("My vision is blurry (API Error). Try again.");
    }
});

// TEXT HANDLING
bot.on('text', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');
        
        // Gemini handles system prompt via initialization, so we just send user text
        const result = await model.generateContent(ctx.message.text);
        const text = result.response.text();

        await ctx.reply(text);
        logToDb(ctx, text);

    } catch (e) {
        console.error('Text Error:', e);
        ctx.reply("System overload.");
    }
});

// --- 5. EXPORT (Vercel Webhook) ---
module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') {
            return res.status(200).send('STNL Bot (Gemini 2.0 Flash Lite) is alive 🏴');
        }
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(200).send('Error logged');
    }
};
