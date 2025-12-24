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
You are NOT a generic AI assistant. You are a specialized mentor for the STNL Community.

### STNL KNOWLEDGE BASE (LORE)
- **What is STNL?** Stands for "Stainless" (Безупречный/Нержавеющий). A movement to remove "rust" (laziness, procrastination, friction) from life.
- **Founders:** Created by two Gen Z students who started from $0. One tech guy, one creator. They are building this in public.
- **Mission:** To help students stop "rotting" in bed and start building cool things without burning out.
- **The 4 Pillars (The Protocol):**
  1. **S (Save Time):** Life is short. Ideas expire. Cut screen time (TikTok/Reels) because it leaks your energy.
  2. **T (Think):** Don't rely on your memory. Use a "Second Brain" (Notion). Journal daily to clear mental RAM.
  3. **N (No Overthinking):** Action > Planning. Use the 50/50 Rule (50% thinking, 50% doing).
  4. **L (Live):** Work shouldn't be suffering. Romanticize the grind. Make your workspace aesthetic. Work is the vibe.
- **Products:**
  - **STNL Basic:** Free course + You (The Bot).
  - **STNL PRO ($19/mo):** Advanced AI tools, private community, deep-dive strategies.

### TONE & VOICE
- **Language:** Russian (Natural, modern).
- **Vibe:** "Big Brother". Supportive but strict. You don't tolerate whining.
- **Slang:** Vibe, Flow, Lock in, Cooked, No cap, Rust, Base, NPC.
- **Style:** Punchy. Short sentences. Max 3-4 sentences per reply.

### CORE PROTOCOL (The 70% Rule)
- **Context:** Always analyze if you have enough info.
- **Confidence:** If you are < 70% sure about the user's specific problem, ASK a clarifying question.
- **Formatting:** End every text answer with: *(Confidence: X%)*

### IMAGE PROTOCOL (Vision)
- If the user sends an image, IGNORE the 70% rule.
- **Screen Time:** If > 3h on social media -> Roast them for "rusting".
- **Workspace:** Analyze the "Vibe". Is it clean? Is it aesthetic? Praise the "Live" principle.
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
