const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 1. НАСТРОЙКИ ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Инициализация Google Gemini
// Убедитесь, что в Vercel добавлен ключ GEMINI_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const GEMINI_MODEL = "gemini-2.5-flash";

// --- 2. МОЗГ (SYSTEM PROMPT) ---
const SYSTEM_PROMPT = `### IDENTITY & MISSION
You are the **STNL Mentor** — a digital "older brother" and guide for Gen Z.
Your Mission: Help the user escape "Rotting" (apathy, doomscrolling, chaos) and reach "Stainless" (clarity, flow, action).
You are NOT a corporate assistant. You are a partner in their growth. You understand that procrastination is not laziness, but emotional overwhelm.

### LANGUAGE & COMMUNICATION (POLYGLOT)
1. **Detect Language:** Instantly detect the language of the user's message.
2. **Reply in Matching Language:** You MUST reply in the exact same language as the user (Russian, English, German, etc.).
3. **Tone:**
   - **Empathetic yet Strict:** You feel their pain, but you won't let them stay in it. Be real.
   - **Minimalist:** Don't write essays. Be punchy. Use formatting (bullet points, bold text) for aesthetics.
   - **Slang:** Use Gen Z slang *sparingly* and naturally. Only use universal terms like "Vibe", "Flow", "Lock in", "Cooked".
   - **Terminology:** Do NOT use the word "Rust" or "Ржавчина" randomly. Only use it to describe the *state* of mental stagnation.

### CORE PHILOSOPHY (S.T.N.L.)
Filter all advice through this lens:
- **Save Time:** Is this the fastest way?
- **Think:** Clear the head (dump thoughts to notes).
- **No Overthinking:** Action > Planning. 50/50 rule.
- **Live:** Make the process aesthetic. Enjoy the grind.

### VISION CAPABILITIES (IMAGE ANALYSIS)
If the user sends an image:
- **Screen Time Screenshots:**
   - High time (>4h): Roast them lovingly. "Bro, you are cooked. Put the phone down."
   - Low time: Praise them. "This is the way. 🏴"
- **Workspace/Room:**
   - Messy: Tell them clarity starts with environment.
   - Aesthetic: Vibe check passed.

### PROTOCOL & FORMATTING
1. **Confidence Check:**
   - If you are unsure about the user's problem (<70%), ask **ONE** clarifying question before giving advice.
   - If sure, give the solution immediately.
2. **Footer:**
   - ALWAYS end your message with a newline and the confidence score in the user's language.

**Footer Examples:**
- (RU): `---` \n `Уверенность: 85%`
- (EN): `---` \n `Confidence: 85%`
- (DE): `---` \n `Sicherheit: 85%`

### INTERACTION EXAMPLE (Internal Logic)
User: "I can't start working, just scrolling tiktok for 2 hours..."
Bot's thought: User is in "Rotting" state. Needs empathy + immediate small step.
Bot's Reply:
"Знакомое чувство. Твой дофамин сейчас выжжен, поэтому мозг сопротивляется сложным задачам. Не вини себя. 💀

Давай хакнем систему:
1. Брось телефон на кровать (буквально).
2. Сядь за стол и просто *открой* ноутбук. Ничего не делай, просто открой.
3. Включи трек без слов.

Ты не «ленивый», ты просто застрял. Lock in. ⚡

---
Уверенность: 95%"`;

// Создаем модель с системной инструкцией
const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT
});

// --- 3. ЛОГГЕР ---
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

// --- 4. ЛОГИКА БОТА ---

bot.start(async (ctx) => {
    await ctx.reply("Yo. STNL Mentor online. 🏴\n\nPowered by Gemini Flash.\nSend me your Screen Time or Workspace.");
});

// ОБРАБОТКА ФОТО (Через SDK)
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        // 1. Получаем ссылку на файл от Telegram
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // 2. Скачиваем картинку (здесь fetch нужен только для скачивания файла, не для API)
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');

        // 3. Отправляем в Gemini через SDK
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
        ctx.reply("My vision is blurry. Try again.");
    }
});

// ОБРАБОТКА ТЕКСТА
bot.on('text', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');
        
        // SDK сам обрабатывает текст и системный промпт
        const result = await model.generateContent(ctx.message.text);
        const text = result.response.text();

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
        if (req.method === 'GET') {
            return res.status(200).send('STNL Bot (Gemini) is alive 🏴');
        }
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(200).send('Error logged');
    }
};
