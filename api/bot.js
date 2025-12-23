const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// 1. Инициализация (Только через переменные окружения!)
// Если переменных нет, код упадет, но не сольет пароли.
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Настройка модели (Gemini 1.5 Pro - Самая умная)
const model = genAI.getGenerativeModel({ model: "gemini-3-pro" });

// Промпт (Личность бота)
const SYSTEM_PROMPT = `You are STNL Bot (Vibe: Gen Z, 'Stainless' mindset). 
Goal: Push students to act, stop rotting, and live. 
Metaphors: 'Rust' = laziness, 'Stainless' = action.
Rules: Keep answers short (max 3 sentences). Be supportive but tough.
Analysis: 
- If user sends Screen Time > 4h: Roast them.
- If user sends aesthetic workspace: Praise the 'Live' principle.`;

// Функция логирования в Supabase
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

// --- ЛОГИКА ---

// Старт
bot.start(async (ctx) => {
    const msg = "Yo. STNL Bot online. 🏴\nI'm running on Gemini Pro.\nSend me your Screen Time or workspace setup.";
    await ctx.reply(msg);
    logToDb(ctx, msg);
});

// Обработка ФОТО (Vision)
bot.on('photo', async (ctx) => {
    try {
        // Показываем юзеру, что бот "печатает" (Gemini Pro думает 3-5 сек)
        await ctx.sendChatAction('typing');

        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');

        // Запрос к Gemini Pro
        const result = await model.generateContent([
            SYSTEM_PROMPT + " Analyze this image strictly based on STNL principles.",
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
        ]);
        
        const text = result.response.text();
        await ctx.reply(text);
        logToDb(ctx, text, 'image');

    } catch (e) {
        console.error('Error:', e);
        ctx.reply("Glitch in the matrix. Try again.");
    }
});

// Обработка ТЕКСТА
bot.on('text', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');
        
        const result = await model.generateContent(`${SYSTEM_PROMPT}\nUser message: ${ctx.message.text}`);
        const text = result.response.text();
        
        await ctx.reply(text);
        logToDb(ctx, text);
    } catch (e) {
        console.error('Error:', e);
        ctx.reply("System overload.");
    }
});

// Экспорт для Vercel Webhook
module.exports = async (req, res) => {
    try {
        // 1. Если просто открыли ссылку в браузере (GET)
        if (req.method === 'GET') {
            return res.status(200).send('STNL Bot is alive 🏴. Set the webhook to use it.');
        }

        // 2. Обработка данных от Telegram
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        // Не отправляем 500, чтобы Telegram не спамил повторами
        res.status(200).send('Error logged'); 
    }
};
