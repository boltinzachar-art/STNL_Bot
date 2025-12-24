const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// Инициализация
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// --- ФУНКЦИИ БАЗЫ ДАННЫХ ---

// Получить или создать юзера
async function getUser(ctx) {
    const { id, username, first_name } = ctx.from;
    
    // Пытаемся найти
    let { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', id)
        .single();

    // Если нет - создаем
    if (!user) {
        const { data: newUser } = await supabase
            .from('users')
            .insert({ telegram_id: id, username, first_name, level: 1 }) // Сразу на 1 уровень
            .select()
            .single();
        return newUser;
    }
    return user;
}

// Обновить уровень
async function levelUp(id, currentLevel) {
    await supabase
        .from('users')
        .update({ level: currentLevel + 1 })
        .eq('telegram_id', id);
}

// --- МОЗГИ GEMINI (СУДЬЯ) ---
// Мы просим ИИ вернуть JSON, чтобы код понял: сдал или нет.
async function checkHomework(type, content, level) {
    let prompt = "";
    
    if (level === 1) prompt = `Analyze this Screen Time image. 
    Output JSON ONLY: {"status": "PASS" or "FAIL", "comment": "Short bro-style feedback"}. 
    PASS condition: Image clearly shows screen time stats. 
    FAIL condition: Not a screen time image or unreadable.`;

    if (level === 2) prompt = `User sent this Journal entry: "${content}". 
    Output JSON ONLY: {"status": "PASS" or "FAIL", "comment": "Feedback"}.
    PASS condition: User confirms they wrote in journal or sent text resembling a reflection.`;

    if (level === 3) prompt = `User sent this Task List: "${content}". 
    Output JSON ONLY: {"status": "PASS" or "FAIL", "comment": "Feedback"}.
    PASS condition: List of small tasks done immediately.`;

    if (level === 4) prompt = `Analyze this Workspace/Vibe photo. 
    Output JSON ONLY: {"status": "PASS" or "FAIL", "comment": "Feedback"}.
    PASS condition: Image shows a laptop, coffee, or aesthetic setup.`;

    // Если это картинка
    if (type === 'image') {
        const result = await model.generateContent([prompt, { inlineData: { data: content, mimeType: "image/jpeg" } }]);
        return parseAIResponse(result.response.text());
    } 
    // Если текст
    else {
        const result = await model.generateContent(prompt);
        return parseAIResponse(result.response.text());
    }
}

// Чистим ответ ИИ от лишнего (markdown ```json ...)
function parseAIResponse(text) {
    try {
        const clean = text.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return { status: "PASS", comment: "Looks good to me. (System Glitch but I'll let it slide)" };
    }
}

// --- ЛОГИКА БОТА ---

bot.start(async (ctx) => {
    const user = await getUser(ctx);
    if (user.level === 0 || user.level === 1) {
        ctx.reply(`🏴 **Welcome to STNL OS, ${user.first_name}.**\n\nProfile Created. System Linked.\n\n🔻 **CURRENT MISSION: LEVEL 1**\nI need to see your digital rust.\n\n**Task:** Send me a screenshot of your Screen Time.`);
    } else {
        ctx.reply(`Yo, you are currently at Level ${user.level}. Keep pushing.`);
    }
});

bot.on(['text', 'photo'], async (ctx) => {
    // 1. Получаем профиль
    const user = await getUser(ctx);
    
    // Если уже прошел игру
    if (user.level > 4) {
        return ctx.reply("You already conquered the protocol. Stay tuned for STNL PRO updates. 🏴");
    }

    ctx.sendChatAction('typing');

    // 2. Подготовка контента (Фото или Текст)
    let type = 'text';
    let content = ctx.message.text;
    
    if (ctx.message.photo) {
        type = 'image';
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        content = Buffer.from(arrayBuffer).toString('base64');
    }

    // 3. Проверка домашки через ИИ
    const aiVerdict = await checkHomework(type, content, user.level);

    // 4. Реакция
    await ctx.reply(aiVerdict.comment);

    // 5. Если сдал -> Level Up
    if (aiVerdict.status === "PASS") {
        await levelUp(user.telegram_id, user.level);
        
        // Сценарий перехода на след уровень
        setTimeout(async () => {
            if (user.level === 1) await ctx.reply("🔓 **LEVEL 2 UNLOCKED: THINK**\n\nTask: Create your Notion Journal (from the course). Send me your first 'Highlight of the day' here text format.");
            if (user.level === 2) await ctx.reply("🔓 **LEVEL 3 UNLOCKED: ACTION**\n\nTask: Do the 5-minute Blitz. Send me the list of tasks you just killed.");
            if (user.level === 3) await ctx.reply("🔓 **LEVEL 4 UNLOCKED: LIVE**\n\nTask: The Vibe Shift. Go to a cafe or clean your desk. Send me a PHOTO of your setup.");
            
            if (user.level === 4) { // Это был последний уровень
                await ctx.reply("🏆 **PROTOCOL COMPLETED**\n\nYou are now Stainless.\nHere is your reward for STNL PRO:\n\n`STNL_EARLY_ACCESS` (-20% Off)\n\nSee you on the inside.");
            }
        }, 1000); // Небольшая задержка для реализма
    } else {
        // Если FAIL
        await ctx.reply("❌ Task Failed. Try again properly.");
    }
});

// Экспорт для Vercel
module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') return res.send('STNL Bot Logic Active 🏴');
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error(e);
        res.status(200).send('Error');
    }
};
