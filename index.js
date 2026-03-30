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
const staffLogs = {};
const requests = new Map();
const warnings = new Map();

// Express
const app = express();
app.use(express.json());
app.use(cors());

// Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
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

// Register commands
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
async function logDisciplinary(embed) {
    try {
        const ch = await client.channels.fetch(process.env.DISCIPLINARY_LOG_CHANNEL_ID);
        if (ch) await ch.send({ embeds: [embed] });
    } catch {}
}

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async (interaction) => {

    // ===== SLASH =====
    if (interaction.isChatInputCommand()) {

        // PANEL
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

        // WARN (MODAL)
        if (interaction.commandName === 'warn') {
            const user = interaction.options.getUser('user');

            const modal = new ModalBuilder()
                .setCustomId(`warn_modal_${user.id}`)
                .setTitle('Warn User');

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reason));

            return interaction.showModal(modal);
        }

        // REMIND (MODAL)
        if (interaction.commandName === 'remind') {
            const user = interaction.options.getUser('user');

            const modal = new ModalBuilder()
                .setCustomId(`remind_modal_${user.id}`)
                .setTitle('Reminder');

            const msg = new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(msg));

            return interaction.showModal(modal);
        }

        // INFO
        if (interaction.commandName === 'information') {
            const user = interaction.options.getUser('user');
            const warns = warnings.get(user.id) || [];

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle('Warning Info')
                        .addFields(
                            { name: 'User', value: `<@${user.id}>` },
                            { name: 'Warnings', value: `${warns.length}` }
                        )
                        .setFooter({ text: 'This message was sent by Empyreum.' })
                ],
                ephemeral: true
            });
        }

        // CLEAR
        if (interaction.commandName === 'clearwarnings') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            warnings.set(user.id, []);

            await logDisciplinary(
                new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('Warnings Cleared')
                    .addFields(
                        { name: 'User', value: `<@${user.id}>` },
                        { name: 'Reason', value: reason }
                    )
                    .setFooter({ text: 'Empyreum Logs' })
            );

            return interaction.reply({ content: 'Warnings cleared.', ephemeral: true });
        }

        // GRAB
        if (interaction.commandName === 'grab') {
            const type = interaction.options.getString('type');
            const username = interaction.options.getString('username');

            if (type === 'single' && !username) {
                return interaction.reply({ content: 'Username required.', ephemeral: true });
            }

            try {
                const res = await fetch(`https://embot-ajd6.onrender.com/staff-time?username=${username}`);
                const data = await res.json();

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle(`Shift Data: ${data.username || username}`)
                            .addFields(
                                { name: 'Total Time', value: data.total || '00:00:00' }
                            )
                            .setFooter({ text: 'This message was sent by Empyreum.' })
                    ],
                    ephemeral: true
                });
            } catch {
                return interaction.reply({ content: 'Failed to fetch data.', ephemeral: true });
            }
        }
    }

    // ===== BUTTONS =====
    if (interaction.isButton()) {

        if (['inactivity_submit', 'username_change', 'resignation'].includes(interaction.customId)) {

            const modal = new ModalBuilder()
                .setCustomId(`${interaction.customId}_modal`)
                .setTitle('Submit Request');

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const extra = new TextInputBuilder()
                .setCustomId('extra')
                .setLabel('Extra Info')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(reason),
                new ActionRowBuilder().addComponents(extra)
            );

            return interaction.showModal(modal);
        }

        // APPROVE / REJECT
        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {

            const [action, id] = interaction.customId.split('_');
            const req = requests.get(id);

            if (!req) {
                return interaction.reply({ content: 'Request not found.', ephemeral: true });
            }

            const user = await client.users.fetch(req.userId);
            const status = action === 'approve' ? 'Approved' : 'Rejected';

            try {
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(action === 'approve' ? 0x2ecc71 : 0xe74c3c)
                            .setTitle(`Request ${status}`)
                            .setDescription(`Your request was ${status.toLowerCase()}.`)
                            .setFooter({ text: 'This message was sent by Empyreum.' })
                    ]
                });
            } catch {}

            await interaction.update({
                content: `Request ${status}`,
                components: []
            });

            requests.delete(id);
        }
    }

    // ===== MODALS =====
    if (interaction.isModalSubmit()) {

        const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);

        // WARN
        if (interaction.customId.startsWith('warn_modal_')) {
            const id = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reason');

            const user = await client.users.fetch(id);

            if (!warnings.has(id)) warnings.set(id, []);
            warnings.get(id).push(reason);

            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xffcc00)
                        .setTitle('Warning')
                        .addFields({ name: 'Reason', value: reason })
                        .setFooter({ text: 'Empyreum' })
                ]
            });

            await logDisciplinary(
                new EmbedBuilder()
                    .setColor(0xffcc00)
                    .setTitle('Warning Issued')
                    .addFields(
                        { name: 'User', value: `<@${id}>` },
                        { name: 'Reason', value: reason }
                    )
                    .setFooter({ text: 'Empyreum Logs' })
            );

            return interaction.reply({ content: 'Warning issued.', ephemeral: true });
        }

        // REMIND
        if (interaction.customId.startsWith('remind_modal_')) {
            const id = interaction.customId.split('_')[2];
            const msg = interaction.fields.getTextInputValue('message');

            const user = await client.users.fetch(id);

            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle('Reminder')
                        .setDescription(msg)
                        .setFooter({ text: 'Empyreum' })
                ]
            });

            await logDisciplinary(
                new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('Reminder Sent')
                    .addFields({ name: 'User', value: `<@${id}>` })
                    .setFooter({ text: 'Empyreum Logs' })
            );

            return interaction.reply({ content: 'Reminder sent.', ephemeral: true });
        }

        // GENERIC REQUESTS (inactivity / username / resignation)
        if (interaction.customId.endsWith('_modal')) {

            const type = interaction.customId.replace('_modal', '');
            const reason = interaction.fields.getTextInputValue('reason');
            const extra = interaction.fields.getTextInputValue('extra');

            const id = Date.now().toString();

            const embed = new EmbedBuilder()
                .setColor(0xffcc00)
                .setTitle(type.replace('_', ' ').toUpperCase())
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>` },
                    { name: 'Reason', value: reason },
                    { name: 'Extra', value: extra || 'None' }
                )
                .setFooter({ text: 'Empyreum' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
            );

            const msg = await channel.send({ content: '@here', embeds: [embed], components: [row] });

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

    let total = 0;
    for (const d in data) total += data[d];

    res.json({ username, total });
});

app.listen(process.env.PORT || 3000, () => console.log('API running'));

client.login(process.env.TOKEN);
