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
    TextInputStyle
} = require('discord.js');

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const staffLogs = {};

const app = express();

app.use(express.json());
app.use(cors());

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: ['CHANNEL']
});

// Track requests
const requests = new Map();

// Track inactivity extensions
const inactivityStore = new Map();

// =========================
// REGISTER COMMAND
// =========================
const commands = [
    new SlashCommandBuilder()
        .setName('spawn_inactivity')
        .setDescription('Spawn staff notices panel')
].map(c => c.toJSON());

const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
    );
})();

// =========================
// READY
// =========================
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// =========================
// PANEL + INTERACTIONS
// =========================
client.on(Events.InteractionCreate, async (interaction) => {

    // ================= SLASH =================
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'spawn_inactivity') {

            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle('Staff Notices Panel')
                .setDescription(`- ╼ 𝐒𝐓𝐀𝐅𝐅 𝐍𝐎𝐓𝐈𝐂𝐄𝐒 ╾ 

*Staff Notices are used to inform HRs+ about status changes. Please use these notices when you require the need to.*

🔹 Inactivity Notices: If you are planning to be away for a period of time.
🔹 Username Changes: If you have updated your Roblox identity.
🔹 Resignation Notices: If you have decided to leave the staff team.

- Note: Inactivity longer than 2 weeks without a notice results in demotion. Notices cannot exceed 1 month without SHR+ approval.

> *To extend your inactivity request, simply extend it by clicking EXTEND on your inactivity notice approval message inside your Direct Messages.*`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('inactivity_submit')
                    .setLabel('Inactivity')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('username_change')
                    .setLabel('Username Change')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId('resignation')
                    .setLabel('Resignation')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // ================= BUTTONS =================
    if (interaction.isButton()) {

        // -------- INACTIVITY --------
        if (interaction.customId === 'inactivity_submit') {

            const modal = new ModalBuilder()
                .setCustomId('inactivity_modal')
                .setTitle('Inactivity Notice');

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const duration = new TextInputBuilder()
                .setCustomId('duration')
                .setLabel('Duration')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(reason),
                new ActionRowBuilder().addComponents(duration)
            );

            return interaction.showModal(modal);
        }

        // -------- USERNAME CHANGE --------
        if (interaction.customId === 'username_change') {

            const modal = new ModalBuilder()
                .setCustomId('username_modal')
                .setTitle('Username Change');

            const oldName = new TextInputBuilder()
                .setCustomId('old')
                .setLabel('Old Username')
                .setStyle(TextInputStyle.Short);

            const newName = new TextInputBuilder()
                .setCustomId('new')
                .setLabel('New Username')
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder().addComponents(oldName),
                new ActionRowBuilder().addComponents(newName)
            );

            return interaction.showModal(modal);
        }

        // -------- RESIGNATION --------
        if (interaction.customId === 'resignation') {

            const modal = new ModalBuilder()
                .setCustomId('resignation_modal')
                .setTitle('Resignation Notice');

            const statement = new TextInputBuilder()
                .setCustomId('statement')
                .setLabel('Reason for resignation')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const date = new TextInputBuilder()
                .setCustomId('date')
                .setLabel('Resignation Date')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(statement),
                new ActionRowBuilder().addComponents(date)
            );

            return interaction.showModal(modal);
        }

        // -------- EXTEND BUTTON (DM) --------
        if (interaction.customId.startsWith('extend_')) {

            const userId = interaction.customId.split('_')[1];

            if (inactivityStore.get(userId)?.extended) {
                return interaction.reply({
                    content: '❌ You already requested an extension. Open a ticket for further requests.',
                    ephemeral: true
                });
            }

            const modal = new ModalBuilder()
                .setCustomId(`extend_modal_${userId}`)
                .setTitle('Extend Inactivity');

            const duration = new TextInputBuilder()
                .setCustomId('duration')
                .setLabel('New Duration')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(duration),
                new ActionRowBuilder().addComponents(reason)
            );

            return interaction.showModal(modal);
        }

        // -------- APPROVE / REJECT --------
        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {

            const [action, requestId] = interaction.customId.split('_');
            const request = requests.get(requestId);

            if (!request) {
                return interaction.reply({ content: 'Request not found.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`${action}_modal_${requestId}`)
                .setTitle(action === 'approve' ? 'Approve Request' : 'Reject Request');

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reason));

            return interaction.showModal(modal);
        }
    }

    // ================= MODALS =================
    if (interaction.isModalSubmit()) {

        // -------- INACTIVITY SUBMIT --------
        if (interaction.customId === 'inactivity_modal') {

            const reason = interaction.fields.getTextInputValue('reason');
            const duration = interaction.fields.getTextInputValue('duration');

            const requestId = Date.now().toString();

            const embed = new EmbedBuilder()
                .setColor(0xffcc00)
                .setTitle('Inactivity Notice Pending')
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>` },
                    { name: 'Reason', value: reason },
                    { name: 'Duration', value: duration }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${requestId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
            );

            const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);

            const msg = await logChannel.send({
                content: '@here',
                embeds: [embed],
                components: [row]
            });

            requests.set(requestId, {
                userId: interaction.user.id,
                type: 'inactivity',
                messageId: msg.id
            });

            // DM user with extend button
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x00cc99)
                    .setTitle('Inactivity Submitted')
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Duration', value: duration }
                    );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`extend_${interaction.user.id}`)
                        .setLabel('Extend Inactivity')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.user.send({ embeds: [dmEmbed], components: [row] });
            } catch {}

            return interaction.reply({ content: 'Submitted for approval.', ephemeral: true });
        }

        // -------- EXTENSION --------
        if (interaction.customId.startsWith('extend_modal_')) {

            const userId = interaction.customId.split('_')[2];

            const duration = interaction.fields.getTextInputValue('duration');
            const reason = interaction.fields.getTextInputValue('reason');

            const requestId = Date.now().toString();

            inactivityStore.set(userId, { extended: true });

            const embed = new EmbedBuilder()
                .setColor(0xffcc00)
                .setTitle('Inactivity Extension Request')
                .addFields(
                    { name: 'User', value: `<@${userId}>` },
                    { name: 'New Duration', value: duration },
                    { name: 'Reason', value: reason }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${requestId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
            );

            const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);

            const msg = await logChannel.send({
                content: '@here',
                embeds: [embed],
                components: [row]
            });

            requests.set(requestId, {
                userId,
                type: 'extension',
                messageId: msg.id
            });

            return interaction.reply({ content: 'Extension submitted.', ephemeral: true });
        }

        // -------- USERNAME CHANGE --------
        if (interaction.customId === 'username_modal') {

            const oldName = interaction.fields.getTextInputValue('old');
            const newName = interaction.fields.getTextInputValue('new');

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle('Username Change Notice')
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>` },
                    { name: 'Old Username', value: oldName },
                    { name: 'New Username', value: newName }
                );

            const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
            await logChannel.send({ embeds: [embed] });

            return interaction.reply({ content: 'Logged.', ephemeral: true });
        }

        // -------- RESIGNATION --------
        if (interaction.customId === 'resignation_modal') {

            const statement = interaction.fields.getTextInputValue('statement');
            const date = interaction.fields.getTextInputValue('date');

            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('Resignation Notice')
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>` },
                    { name: 'Statement', value: statement },
                    { name: 'Resignation Date', value: date }
                );

            const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
            await logChannel.send({ content: '@here', embeds: [embed] });

            return interaction.reply({ content: 'Submitted.', ephemeral: true });
        }

        // -------- APPROVAL MODALS --------
        if (interaction.customId.startsWith('approve_modal_') || interaction.customId.startsWith('reject_modal_')) {

            const [action, , requestId] = interaction.customId.split('_');
            const reason = interaction.fields.getTextInputValue('reason');

            const request = requests.get(requestId);
            if (!request) return interaction.reply({ content: 'Request not found.', ephemeral: true });

            const logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
            const message = await logChannel.messages.fetch(request.messageId);

            const user = await client.users.fetch(request.userId);

            const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                .setColor(action === 'approve' ? 0x2ecc71 : 0xe74c3c)
                .addFields(
                    { name: 'Status', value: action === 'approve' ? 'Approved' : 'Rejected' },
                    { name: 'Handled By', value: `<@${interaction.user.id}>` },
                    { name: 'Reason', value: reason }
                );

            await message.edit({ embeds: [updatedEmbed], components: [] });

            try {
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(action === 'approve' ? 0x2ecc71 : 0xe74c3c)
                            .setTitle(`Your request was ${action === 'approve' ? 'approved' : 'rejected'}`)
                            .addFields({ name: 'Reason', value: reason })
                    ]
                });
            } catch {}

            return interaction.reply({ content: 'Updated.', ephemeral: true });
        }
    }
});

app.post('/log-shift', (req, res) => {
    const { username, duration, date } = req.body;

    if (!username || !duration || !date) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    if (!staffLogs[username]) {
        staffLogs[username] = {};
    }

    if (!staffLogs[username][date]) {
        staffLogs[username][date] = 0;
    }

    staffLogs[username][date] += duration;

    return res.json({ success: true });
});

app.get('/staff-time', (req, res) => {
    const { username } = req.query;

    const userData = staffLogs[username];

    if (!userData) {
        return res.json({
            username,
            daily: {},
            total: "00:00:00"
        });
    }

    let totalSeconds = 0;
    const daily = {};

    for (const day in userData) {
        totalSeconds += userData[day];
        daily[day] = formatTime(userData[day]);
    }

    res.json({
        username,
        daily,
        total: formatTime(totalSeconds)
    });
});

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [h, m, s]
        .map(v => String(v).padStart(2, '0'))
        .join(':');
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
});
client.login(process.env.TOKEN);