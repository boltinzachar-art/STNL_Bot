const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// --- 1. CONFIGURATION ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Настройки Perplexity
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
// Используем топовую модель Sonar (она умеет и поиск, и картинки)
const PERPLEXITY_MODEL = 'llama-3.1-sonar-large-128k-online'; 

// --- 2. THE BRAIN (SYSTEM PROMPT) ---
const SYSTEM_PROMPT = `
### ROLE & IDENTITY
You are the **STNL Mentor** (Stainless Intelligence).
Your mission is to help Gen Z students and young creators fix their lives using the STNL Protocol.

### TONE & VOICE
- **Language:** Russian (Use natural, modern language).
- **Vibe:** "Big Brother". Supportive but strict. No excuses.
- **Slang:** Use words like: Vibe, Flow, Lock in, Cooked, No cap, Rust, Stainless.
- **Style:** Concise. Punchy. Max 3-4 sentences.

### CORE PROTOCOL: THE 70% RULE (Text Only)
1. **Analyze context.**
2. **Confidence Check:** If you are < 70% sure about the user's problem, ASK clarifying questions first.
3. **Format:** End every text response with: *(Confidence: X%)*

### IMAGE PROTOCOL (Vision)
- If the user sends an image, IGNORE the 70% rule.
- Analyze immediately.
- If it's Screen Time > 3h: Roast them for rusting.
- If it's a Workspace: Rate the vibe (Clean/Chaotic).
`;

// --- 3. HELPER FUNCTIONS ---

// Логгер в базу
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

// Универсальная функция запроса к Perplexity (Текст или Картинка)
async function callPerplexity(messages) {
    try {
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
        
        // Проверка на ошибки API
        if (data.error) {
            console.error('Perplexity API Error:', data.error);
            return "Brain freeze (API Error). Try again.";
        }
        
        return data.choices[0].message.content;

    } catch (error) {
        console.error('Fetch Error:', error);
        return "Connection lost. I'm offline.";
    }
}

// --- 4. BOT LOGIC ---

bot.start(async (ctx) => {
    const msg = "Yo, I'm STNL Bot. 🏴\nPowered by Perplexity Sonar.\n\nSend me your Screen Time or tell me what's wrong.";
    await ctx.reply(msg);
    logToDb(ctx, msg);
});

// ОБРАБОТКА ФОТО (Vision via Perplexity)
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        // 1. Получаем ссылку и скачиваем картинку
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        // 2. Формируем запрос (OpenAI-compatible format для картинок)
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { 
                role: 'user', 
                content: [
                    { type: 'text', text: "Analyze this image based on STNL principles. Roast or praise." },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ] 
            }
        ];

        // 3. Отправляем
        const text = await callPerplexity(messages);
        await ctx.reply(text);
        logToDb(ctx, text, 'image');

    } catch (e) {
        console.error('Photo Error:', e);
        ctx.reply("Glitch processing image. Try again.");
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

        const text = await callPerplexity(messages);
        
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
            return res.status(200).send('STNL Bot (Perplexity Only) is alive 🏴');
        }
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook Error:', e);
        res.status(200).send('Error logged');
    }
};
