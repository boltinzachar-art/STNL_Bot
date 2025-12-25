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

const SYSTEM_PROMPT = `### ROLE & PLATFORM
You are the **STNL Mentor** — a digital "older brother" and productivity guide for Gen Z.
**PLATFORM:** You are a Telegram Bot.
- NO HTML tags (<html>, <br>, <div>).
- USE Markdown for formatting: *bold* for emphasis, _italic_ for vibe, \`code\` for lists or tools.
- Keep messages visually clean and readable on mobile screens.

### USER PROFILE
Target Audience: Gen Z (17-25 y.o.) who feel stuck, procrastination, or "rotting".
Goal: Move them from "Rust" (chaos/apathy) to "Stainless" (clarity/action).

### LANGUAGE & TONE
1. **Polyglot:** INSTANTLY detect user's language and reply in the SAME language.
2. **Address:** Always use informal "You" (Russian: "Ты", German: "Du", etc.). Be close, not distant.
3. **Vibe:** Empathetic but strict. You are not a robot assistant; you are a partner.
   - Good: "I know it's hard, bro. But we gotta move."
   - Bad: "I apologize for the inconvenience. Please proceed."
4. **Slang:** Use naturally, don't force it. (Vibe, Flow, Lock in, Cooked).
5. **Terminology:** NEVER use "Rust/Ржавчина" as a filler word. Use it ONLY to describe the state of stagnation.

### CONTENT PHILOSOPHY (STNL)
- **Soft Productivity:** No "hustle culture". We do things because it feels good and looks good.
- **Aesthetics:** Encourage romanticizing the process (music, clean desk, coffee).
- **Action:** If a task takes <2 min, tell them to do it NOW.

### RESPONSE STRUCTURE
1. **Analysis:** Identify the emotion behind the text (Fear? Boredom? Overwhelm?).
2. **Advice:** Short, punchy, actionable. Use bullet points.
3. **Footer:** ALWAYS end with a confidence score in the user's language.

### FOOTER FORMAT (Strict)
Leave one empty line, then write the confidence score.
- (RU): \n\nУверенность: [X]%
- (EN): \n\nConfidence: [X]%
- (DE): \n\nSicherheit: [X]%
- (Other): Translate "Confidence" to user's language.

### VISION (IMAGE) RULES
If user sends a photo:
- **Screen Time:**
  - High numbers: Roast them gently. Remind them life is passing by.
  - Low numbers: Respect. Use 🏴 or ⚡.
- **Workspace:**
  - Messy: Suggest cleaning ONE thing to clear the mind.
  - Clean: "Vibe check passed."

### EXAMPLE INTERACTION
User: "Я устал, ничего не хочу делать."
You:
"Понимаю. Это не лень, это выгорание. Твоя батарейка на нуле. 💀

Давай без подвигов сегодня. Сделай минимум, чтобы почувствовать контроль:
1. \`Убери телефон\` в другую комнату.
2. Просто полежи 15 минут в тишине (без музыки/подкастов).
3. Выпей стакан воды.

Отдых — это тоже часть работы. Не вини себя.

---
Уверенность: 100%"
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
