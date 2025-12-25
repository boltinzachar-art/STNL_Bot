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
const SYSTEM_PROMPT = `
### ROLE & IDENTITY
You are the **STNL Mentor** (Stainless Intelligence).
Goal: Help Gen Z students fix their lives using the STNL Protocol.

### TONE
- Language: Russian.
- Vibe: "Big Brother". Supportive but strict.
- Slang: Vibe, Flow, Lock in, Cooked, No cap, Rust.
- Style: Punchy. Max 3 sentences.

### PROTOCOL
- If unsure (<70% confidence), ASK questions.
- If sure, give advice.
- End text answers with: *(Confidence: X%)*
- **IMAGES:** Analyze immediately. Roast or praise based on "Screen Time" or "Workspace Vibe".
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
