const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch'); // Для надежности на Vercel

// --- 1. CONFIGURATION ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
// Используем новую простую модель
const PERPLEXITY_MODEL = 'sonar'; 

// --- 2. SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
### ROLE & IDENTITY
You are the **STNL Mentor** (Stainless Intelligence).
Mission: Help Gen Z students fix their lives using the STNL Protocol.

### TONE
- Language: Russian.
- Vibe: "Big Brother". Supportive but strict.
- Slang: Vibe, Flow, Lock in, Cooked, No cap, Rust.
- Style: Punchy. Max 3 sentences.

### PROTOCOL (The 70% Rule)
- If unsure (<70% confidence), ASK questions.
- If sure, give advice.
- End text answers with: *(Confidence: X%)*
- **IMAGES:** Analyze immediately. Ignore the 70% rule. Roast or praise.
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

// Единая функция запроса
async function askPerplexity(messages) {
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
        
        // Обработка ошибок API
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
    await ctx.reply("Yo. STNL Bot online. 🏴\n\n🧠 Powered by Perplexity Sonar.\n\nSend me your Screen Time or workspace photo.");
});

// ОБРАБОТКА ФОТО (Vision)
bot.on('photo', async (ctx) => {
    try {
        await ctx.sendChatAction('typing');

        // 1. Получаем файл
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // 2. Скачиваем
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        // 3. Формируем запрос (Multimodal)
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
