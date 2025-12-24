const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
// СТРОКУ const fetch = require('node-fetch') МЫ УДАЛИЛИ. ОНА НЕ НУЖНА.

// --- 1. CONFIGURATION ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'sonar'; 

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

async function askPerplexity(messages) {
    try {
        // Используем встроенный fetch (без require)
        const response = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: PERPLEXITY_MODEL,
                messages: messages,
                temperature: 0.6
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('API Error:', JSON.stringify(data));
            return `Brain glitch: ${data.error.message}`;
        }
        
        if (!data.choices || data.choices.length === 0) {
            return "Silence... (API empty response)";
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error('Fetch Error:', error);
        return "Connection lost. I'm offline.";
    }
}

// --- 4. BOT LOGIC ---

bot.start(async (ctx) => {
    await ctx.reply("Yo. STNL Mentor online. 🏴\n\nI help you stay Stainless.\nSend me your Screen Time, Workspace photo, or tell me why you are stuck.");
});

// ОБРАБОТКА ФОТО
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { 
                role: 'user', 
                content: [
                    { type: 'text', text: "Analyze this image based on STNL principles." },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ] 
            }
        ];

        const text = await askPerplexity(messages);
        await ctx.reply(text);
        logToDb(ctx, text, 'image');

    } catch (e) {
        console.error('Vision Error:', e);
        ctx.reply("Can't see right now. Perplexity API is busy.");
    }
});

// ОБРАБОТКА ТЕКСТА
bot.on('text', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');
        
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: ctx.message.text }
        ];

        const text = await askPerplexity(messages);
        await ctx.reply(text);
        logToDb(ctx, text);

    } catch (e) {
        console.error('Text Error:', e);
        ctx.reply("System overload.");
    }
});

// --- 5. EXPORT ---
module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') return res.status(200).send('STNL Bot (Sonar) is alive 🏴');
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(200).send('Error logged');
    }
};
