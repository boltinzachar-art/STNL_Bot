const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- 1. CONFIGURATION ---
// Инициализируем клиентов. Если переменных нет, код не упадет сразу, а выдаст ошибку в логах.
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Используем модель Gemini 1.5 Pro (самая умная)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// --- 2. THE BRAIN (SYSTEM PROMPT) ---
const SYSTEM_PROMPT = `
### ROLE & IDENTITY
You are the **STNL Mentor** (Stainless Intelligence).
You have already walked the path from "rotting" (procrastination/chaos) to being "Stainless" (frictionless action/clarity).
Your mission is to help Gen Z students and young creators build their first business and fix their lives using the STNL Protocol.

### TONE & VOICE
- **Language:** Russian (Use natural, modern language).
- **Vibe:** "Big Brother". You are supportive and friendly, but you do not tolerate excuses.
- **Sharpness:** Be slightly stinging if the user is whining. Call out their "rust" (laziness/overthinking) to make them wake up.
- **Slang:** Use occasional English terms natural for Gen Z (Vibe, Flow, Lock in, Cooked, No cap, Rust, Stainless, Base).
- **Style:** Concise. No lectures. Punchy sentences.

### CORE PROTOCOL: THE 70% RULE (CRITICAL)
For any TEXT-based request (advice, help, questions):
1.  **Analyze the context.** Do you have enough information to give a specific, high-quality solution?
2.  **Calculate Confidence.** If your confidence is **below 70%**, you MUST ask clarifying questions. Do not guess. Dig deeper.
3.  **Action:**
    - If Confidence < 70%: Ask 1-2 sharp questions to understand the root cause.
    - If Confidence >= 70%: Provide the solution immediately.
4.  **Format:** At the end of EVERY text response, you must write in a new line:
    *(Confidence: X%)*

### EXCEPTION PROTOCOL: IMAGE ANALYSIS (HOMEWORK)
If the user sends an IMAGE (Screenshot or Photo), **IGNORE the 70% rule**.
- Do not ask questions. Analyze the image immediately.
- **Screen Time (Module 1):** If social media > 3h, roast them for "leaking time". If < 2h, praise them.
- **Workspace/Vibe (Module 4):** Judge the aesthetic. Is it a place for focus or chaos?

### STNL KNOWLEDGE BASE
- **S (Save Time):** Life is short. Ideas die if not executed immediately.
- **T (Think):** Use a Second Brain (Notion/Journal). Don't hold ideas in your head.
- **N (No Overthinking):** 50% Strategy, 50% Action. Action kills fear.
- **L (Live):** Work is not suffering. Romanticize the grind. Work is the vibe.
- **Our Goal:** To build a generation of "Stainless" creators who act fast and live fully.
`;

// --- 3. HELPER FUNCTIONS ---

// Логгер в Supabase (чтобы ты видел историю)
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
        console.error('Supabase Log Error:', e.message);
    }
}

// --- 4. BOT LOGIC ---

// Команда /start
bot.start(async (ctx) => {
    const msg = "Yo, welcome to the Protocol. 🏴\nЯ STNL Bot.\n\nСкидывай мне скриншот экранного времени, фотку рабочего места или просто пиши, что у тебя не получается.\n\nLet's wipe off the rust.";
    await ctx.reply(msg);
    logToDb(ctx, msg);
});

// Обработка ФОТО (Vision)
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        // 1. Получаем ссылку на файл от Telegram
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        // 2. Скачиваем файл в буфер
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');

        // 3. Отправляем в Gemini (Спец. инструкция для фото)
        const visionPrompt = `${SYSTEM_PROMPT}\n\nUSER SENT AN IMAGE. Analyze it based on STNL principles immediately. Ignore the 70% confidence rule. Just roast or praise.`;
        
        const result = await model.generateContent([
            visionPrompt,
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);

        const text = result.response.text();
        await ctx.reply(text);
        logToDb(ctx, text, 'image');

    } catch (e) {
        console.error('Photo Error:', e);
        ctx.reply("Glitch processing image. Try again.");
    }
});

// Обработка ТЕКСТА (Chat)
bot.on('text', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');
        
        // Объединяем Промпт + Сообщение юзера
        const fullPrompt = `${SYSTEM_PROMPT}\n\nUSER MESSAGE: "${ctx.message.text}"`;
        
        const result = await model.generateContent(fullPrompt);
        const text = result.response.text();
        
        await ctx.reply(text);
        logToDb(ctx, text);

    } catch (e) {
        console.error('Text Error:', e);
        ctx.reply("System overload. Wait a sec.");
    }
});

// --- 5. VERCEL WEBHOOK EXPORT ---

module.exports = async (req, res) => {
    try {
        // Защита от открытия в браузере (GET запрос)
        if (req.method === 'GET') {
            return res.status(200).send('STNL Bot is alive 🏴. System operational.');
        }

        // Обработка вебхука от Telegram (POST запрос)
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');

    } catch (e) {
        console.error('Webhook Error:', e);
        // Отвечаем 200, чтобы Telegram не слал повторы при ошибке
        res.status(200).send('Error logged');
    }
};
