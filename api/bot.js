const { Telegraf } = require('telegraf');

// Инициализация
const bot = new Telegraf(process.env.BOT_TOKEN);

// Логика
bot.start((ctx) => ctx.reply('I am alive! 🏴'));
bot.on('text', (ctx) => ctx.reply(`You said: ${ctx.message.text}`));
bot.on('photo', (ctx) => ctx.reply('Nice photo, bro.'));

// Экспорт
module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') {
            return res.status(200).send('Echo Bot is ready.');
        }
        
        // Логируем входящий запрос, чтобы видеть его в Vercel
        console.log("Update received:", JSON.stringify(req.body));
        
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (e) {
        console.error('Error:', e);
        res.status(200).send('Error');
    }
};
