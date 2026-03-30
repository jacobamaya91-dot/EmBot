const {
    Client,
    GatewayIntentBits,
    Events,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes
} = require('discord.js');

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Stores
const staffLogs = {}; // Format: { "Username": { total: 0, rank: "RankName" } }
const requests = new Map();
const warnings = new Map();
let masterMessageId = null; 

const MASTER_CHANNEL_ID = "1483474916438442016";

// Express
const app = express();
app.use(express.json());
app.use(cors());

// Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL']
});

// ================= COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName('spawn_inactivity')
        .setDescription('Spawns the Empyreúm Staff Notice filing panel'),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a formal staff warning')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to warn')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Send a staff reminder')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to remind')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('information')
        .setDescription('View warning count')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear warnings')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to clear')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason')
                .setDescription('Reason')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('grab')
        .setDescription('Fetch staff shift time')
        .addStringOption(o =>
            o.setName('type')
                .setDescription('single, lr, or mr')
                .setRequired(true)
                .addChoices(
                    { name: 'single', value: 'single' },
                    { name: 'LR', value: 'lr' },
                    { name: 'MR', value: 'mr' }
                )
        )
        .addStringOption(o =>
            o.setName('username')
                .setDescription('Roblox username')
        )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('✅ Commands registered');
    } catch (err) {
        console.error(err);
    }
})();

// ================= READY =================
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ================= HELPERS =================
function formatDuration(seconds) {
    seconds = Number(seconds) || 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function logDisciplinary(embed) {
    try {
        const ch = await client.channels.fetch(process.env.DISCIPLINARY_LOG_CHANNEL_ID);
        if (ch) await ch.send({ embeds: [embed] });
    } catch {}
}

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'spawn_inactivity') {
            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle('Staff Notices Panel')
                .setDescription('Select a notice type below.')
                .setFooter({ text: 'This message was sent by Empyreum.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('inactivity_submit').setLabel('Inactivity').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('username_change').setLabel('Username Change').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('resignation').setLabel('Resignation').setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        if (interaction.commandName === 'warn') {
            const user = interaction.options.getUser('user');
            const modal = new ModalBuilder().setCustomId(`warn_modal_${user.id}`).setTitle('Warn User');
            const reason = new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reason));
            return interaction.showModal(modal);
        }

        if (interaction.commandName === 'remind') {
            const user = interaction.options.getUser('user');
            const modal = new ModalBuilder().setCustomId(`remind_modal_${user.id}`).setTitle('Reminder');
            const msg = new TextInputBuilder().setCustomId('message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(msg));
            return interaction.showModal(modal);
        }

        if (interaction.commandName === 'information') {
            const user = interaction.options.getUser('user');
            const warns = warnings.get(user.id) || [];
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle('Warning Info')
                        .addFields({ name: 'User', value: `<@${user.id}>` }, { name: 'Warnings', value: `${warns.length}` })
                        .setFooter({ text: 'This message was sent by Empyreum.' })
                ],
                ephemeral: true
            });
        }

        if (interaction.commandName === 'clearwarnings') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            warnings.set(user.id, []);
            await logDisciplinary(
                new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('Warnings Cleared')
                    .addFields({ name: 'User', value: `<@${user.id}>` }, { name: 'Reason', value: reason })
                    .setFooter({ text: 'Empyreum Logs' })
            );
            return interaction.reply({ content: 'Warnings cleared.', ephemeral: true });
        }

        if (interaction.commandName === 'grab') {
            const type = interaction.options.getString('type');
            const username = interaction.options.getString('username');
            if (type === 'single' && !username) return interaction.reply({ content: 'Username required.', ephemeral: true });

            const data = staffLogs[username];
            const timeStr = data ? formatDuration(data.total) : "00:00:00";

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle(`Shift Data: ${username}`)
                        .addFields({ name: 'Total Time', value: timeStr })
                        .setFooter({ text: 'This message was sent by Empyreum.' })
                ],
                ephemeral: true
            });
        }
    }

    if (interaction.isButton()) {
        if (['inactivity_submit', 'username_change', 'resignation'].includes(interaction.customId)) {
            const modal = new ModalBuilder().setCustomId(`${interaction.customId}_modal`).setTitle('Submit Request');
            const reason = new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);
            const extra = new TextInputBuilder().setCustomId('extra').setLabel('Extra Info').setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(reason), new ActionRowBuilder().addComponents(extra));
            return interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
            const [action, id] = interaction.customId.split('_');
            const req = requests.get(id);
            if (!req) return interaction.reply({ content: 'Request not found.', ephemeral: true });

            const user = await client.users.fetch(req.userId);
            const status = action === 'approve' ? 'Approved' : 'Rejected';
            try {
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(action === 'approve' ? 0x2ecc71 : 0xe74c3c)
                            .setTitle(`Request ${status}`)
                            .setDescription(`Your request was ${status.toLowerCase()}.`)
                    ]
                });
            } catch {}
            await interaction.update({ content: `Request ${status}`, components: [] });
            requests.delete(id);
        }
    }

    if (interaction.isModalSubmit()) {
        const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);

        if (interaction.customId.startsWith('warn_modal_')) {
            const id = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reason');
            const user = await client.users.fetch(id);
            if (!warnings.has(id)) warnings.set(id, []);
            warnings.get(id).push(reason);
            try { await user.send({ embeds: [new EmbedBuilder().setColor(0xffcc00).setTitle('Warning').addFields({ name: 'Reason', value: reason })] }); } catch {}
            await logDisciplinary(new EmbedBuilder().setColor(0xffcc00).setTitle('Warning Issued').addFields({ name: 'User', value: `<@${id}>` }, { name: 'Reason', value: reason }));
            return interaction.reply({ content: 'Warning issued.', ephemeral: true });
        }

        if (interaction.customId.startsWith('remind_modal_')) {
            const id = interaction.customId.split('_')[2];
            const msg = interaction.fields.getTextInputValue('message');
            const user = await client.users.fetch(id);
            try { await user.send({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('Reminder').setDescription(msg)] }); } catch {}
            await logDisciplinary(new EmbedBuilder().setColor(0x3498db).setTitle('Reminder Sent').addFields({ name: 'User', value: `<@${id}>` }));
            return interaction.reply({ content: 'Reminder sent.', ephemeral: true });
        }

        if (interaction.customId.endsWith('_modal')) {
            const type = interaction.customId.replace('_modal', '');
            const reason = interaction.fields.getTextInputValue('reason');
            const extra = interaction.fields.getTextInputValue('extra');
            const id = Date.now().toString();
            const embed = new EmbedBuilder().setColor(0xffcc00).setTitle(type.toUpperCase().replace('_', ' ')).addFields({ name: 'User', value: `<@${interaction.user.id}>` }, { name: 'Reason', value: reason }, { name: 'Extra', value: extra || 'None' });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_${id}`).setLabel('Approve').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_${id}`).setLabel('Reject').setStyle(ButtonStyle.Danger));
            await channel.send({ content: '@here', embeds: [embed], components: [row] });
            requests.set(id, { userId: interaction.user.id, type });
            return interaction.reply({ content: 'Submitted.', ephemeral: true });
        }
    }
});

// ================= API =================

app.get('/staff-time', (req, res) => {
    const { username } = req.query;
    const data = staffLogs[username];
    if (!data) return res.json({ username, total: "00:00:00" });
    res.json({ username, total: formatDuration(data.total) });
});

app.post('/update-staff', async (req, res) => {
    const { username, duration, rankName } = req.body;

    if (!staffLogs[username]) {
        staffLogs[username] = { total: 0, rank: rankName };
    }
    
    staffLogs[username].total += duration;
    staffLogs[username].rank = rankName;

    try {
        const channel = await client.channels.fetch(MASTER_CHANNEL_ID);
        const categories = {};

        for (const user in staffLogs) {
            const r = staffLogs[user].rank || "Staff";
            if (!categories[r]) categories[r] = "";
            categories[r] += `**${user}**: ${formatDuration(staffLogs[user].total)}\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle("Weekly Staff Shift Leaderboard")
            .setDescription("Updates automatically when staff leave the server.\n*Resets Sundays at 11:59 PM EST*")
            .setColor(0x2b2d31)
            .setTimestamp()
            .setFooter({ text: "Empyreum Live Logs" });

        for (const rank in categories) {
            embed.addFields({ name: rank, value: categories[rank] || "None" });
        }

        if (!masterMessageId) {
            const msg = await channel.send({ embeds: [embed] });
            masterMessageId = msg.id;
        } else {
            const msg = await channel.messages.fetch(masterMessageId);
            await msg.edit({ embeds: [embed] });
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Leaderboard Error:", err);
        res.status(500).json({ error: "Failed to update leaderboard" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

client.login(process.env.TOKEN);
