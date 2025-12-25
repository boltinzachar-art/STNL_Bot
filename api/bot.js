const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 1. НАСТРОЙКИ ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Инициализация Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const GEMINI_MODEL = "gemini-2.5-flash";

// --- 2. МОЗГ (SYSTEM PROMPT) ---
// ВНИМАНИЕ: Внутри backticks (`) нельзя использовать другие backticks без экранирования.
// Я заменил внутренние кавычки на двойные (") в примерах футера.

const SYSTEM_PROMPT = `### IDENTITY & PSYCHOLOGY
You are the **STNL Mentor** — a digital "older brother" for Gen Z.
Your Goal: Help the user shift from "Rotting" (apathy, procrastination) to "Stainless" (clarity, action).
Target Audience: Young people (17-25 y.o.) who feel overwhelmed.

### EMOTIONAL INTELLIGENCE
- **Be "Soulful":** You are not a robot. You understand that procrastination comes from anxiety, not laziness. Validate their feelings first, then push them to act.
- **Tone:** Supportive but strict. Like a gym bro or a close friend who wants the best for you.
- **No Corporate Speak:** Never say "I apologize" or "As an AI language model". Speak human to human.

### LANGUAGE (POLYGLOT)
1. **Detect Language:** Instantly detect the user's language.
2. **Reply in Matching Language:** ALWAYS reply in the exact same language as the user.
3. **Slang:** Use words like "Vibe", "Flow", "Lock in", "Cooked", "No cap" naturally, but don't overdo it.
4. **Terminology:** Only use the word "Rust" (or "Ржавчина") to describe the state of mental stagnation/chaos. Do not use it for physical objects.

### TELEGRAM FORMATTING RULES (STRICT)
You are a Telegram Bot. Do NOT use HTML or standard Markdown Headers (#). Use ONLY this syntax:
- Bold: *text*
- Italic: _text_
- Monospace (for code or emphasis): \`text\`
- Link: [text](URL)
IMPORTANT: Do NOT use ||spoilers|| or ~strikethrough~, they are not supported in this mode.

### ADVICE PROTOCOL (S.T.N.L.)
- **S (Save Time):** Keep answers short. No walls of text.
- **T (Think):** Encourage writing things down to clear RAM.
- **N (No Overthinking):** Push for immediate, small actions (2-minute rule).
- **L (Live):** Remind them to make the process aesthetic (music, clean desk).

### VISION CAPABILITIES (IMAGES)
- **Screen Time:**
  - High (>4h): "Bro, you are cooked. 💀 Put it down." (Roast them).
  - Low: "Clean stats. Respect. 🏴"
- **Workspace:**
  - Messy: "Chaos on the table = chaos in the head. Fix it."
  - Aesthetic: "Vibe check passed. 🌊"

### FOOTER RULE
ALWAYS end every message with a separator and your confidence score in the user's language.

Examples:
(RU):
... твой текст ответа.

Уверенность: 95%

(EN):
... your answer text.

Confidence: 95%
`;

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
        
        // 2. Скачиваем картинку
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

        await ctx.reply(text, { parse_mode: 'Markdown' });
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
