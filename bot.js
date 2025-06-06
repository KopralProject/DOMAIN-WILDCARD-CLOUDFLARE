const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const userSessions = {}; // userId: { apiToken, accountId, zoneId }

const MAIN_MENU = Markup.keyboard([
  ['➕ Tambah Domain', '🌟 Pasang Wildcard'],
  ['📜 List Domain', '✨ List Wildcard'],
  ['❌ Hapus Wildcard']
]).resize();

bot.start((ctx) =>
  ctx.reply('🟢 Selamat datang di Bot Cloudflare DNS!\nSilakan /login untuk mulai.')
);

bot.command('login', (ctx) => {
  ctx.reply('Masukkan API Token, Account ID, dan Zone ID dengan format:\nAPI_TOKEN|ACCOUNT_ID|ZONE_ID');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Login handler
  if (
    !userSessions[userId] &&
    /^([a-zA-Z0-9\-_]+)\|([a-zA-Z0-9\-_]+)\|([a-zA-Z0-9\-_]+)$/.test(text)
  ) {
    const [apiToken, accountId, zoneId] = text.split('|');
    userSessions[userId] = { apiToken, accountId, zoneId, step: null, buffer: {} };
    return ctx.reply('✅ Login berhasil!', MAIN_MENU);
  }

  // Require login
  if (!userSessions[userId])
    return ctx.reply('🔒 Silakan login dulu dengan /login.');

  const session = userSessions[userId];

  // Step handler
  if (session.step === 'add_domain_name') {
    session.buffer.name = text;
    session.step = 'add_domain_ip';
    return ctx.reply('Masukkan IP VPS tujuan:', MAIN_MENU);
  }
  if (session.step === 'add_domain_ip') {
    session.buffer.ip = text;
    session.step = 'add_domain_proxy';
    return ctx.reply('Status awan oranye (ON/OFF):\n🟠 ON   ⚪️ OFF', MAIN_MENU);
  }
  if (session.step === 'add_domain_proxy') {
    const proxy = /^on$/i.test(text);
    // Proses API ke Cloudflare
    const { name, ip } = session.buffer;
    const res = await cfAddDNS({
      ...session,
      type: 'A',
      name,
      content: ip,
      proxied: proxy
    });
    session.step = null;
    session.buffer = {};
    if (res.success) {
      return ctx.reply(
        `✅ Domain berhasil ditambahkan!\n➕ Nama: ${name}\n🖥️ IP: ${ip}\nAwan Oranye: ${proxy ? 'ON 🟠' : 'OFF ⚪️'}`,
        MAIN_MENU
      );
    } else {
      return ctx.reply('❌ Gagal tambah domain:\n' + res.error, MAIN_MENU);
    }
  }

  if (session.step === 'add_wildcard_cname') {
    session.buffer.target = text;
    session.step = 'add_wildcard_proxy';
    return ctx.reply('Status awan oranye (ON/OFF):\n🟠 ON   ⚪️ OFF', MAIN_MENU);
  }
  if (session.step === 'add_wildcard_proxy') {
    const proxy = /^on$/i.test(text);
    const { target } = session.buffer;
    // Proses API ke Cloudflare
    const res = await cfAddDNS({
      ...session,
      type: 'CNAME',
      name: '*',
      content: target,
      proxied: proxy
    });
    session.step = null;
    session.buffer = {};
    if (res.success) {
      return ctx.reply(
        `✅ Wildcard berhasil dipasang!\n🌟 Nama: *\n🎯 Target: ${target}\nAwan Oranye: ${proxy ? 'ON 🟠' : 'OFF ⚪️'}`,
        MAIN_MENU
      );
    } else {
      return ctx.reply('❌ Gagal pasang wildcard:\n' + res.error, MAIN_MENU);
    }
  }

  // Menu handler
  if (text === '➕ Tambah Domain') {
    session.step = 'add_domain_name';
    session.buffer = {};
    return ctx.reply('Masukkan nama domain/subdomain (contoh: api.domain.com):', MAIN_MENU);
  }

  if (text === '🌟 Pasang Wildcard') {
    session.step = 'add_wildcard_cname';
    session.buffer = {};
    return ctx.reply('Masukkan domain target untuk wildcard (contoh: domain.com):', MAIN_MENU);
  }

  if (text === '📜 List Domain') {
    const res = await cfListDNS(session);
    if (!res.success) return ctx.reply('❌ Gagal ambil data:\n' + res.error, MAIN_MENU);
    if (!res.records.length) return ctx.reply('Belum ada domain.', MAIN_MENU);
    let msg = '📜 Daftar Domain:\n';
    res.records.forEach((r, i) => {
      if (r.type === 'A')
        msg += `${i + 1}. ➕ ${r.name} - 🖥️ ${r.content} - ${r.proxied ? '🟠 ON' : '⚪️ OFF'}\n`;
      if (r.type === 'CNAME' && r.name !== '*')
        msg += `${i + 1}. 🔗 ${r.name} - 🎯 ${r.content} - ${r.proxied ? '🟠 ON' : '⚪️ OFF'}\n`;
    });
    ctx.reply(msg, MAIN_MENU);
    return;
  }

  if (text === '✨ List Wildcard') {
    const res = await cfListDNS(session);
    if (!res.success) return ctx.reply('❌ Gagal ambil data:\n' + res.error, MAIN_MENU);
    const wilds = res.records.filter((r) => r.type === 'CNAME' && r.name.startsWith('*'));
    if (!wilds.length) return ctx.reply('Belum ada wildcard.', MAIN_MENU);
    let msg = '✨ Daftar Wildcard:\n';
    wilds.forEach((r, i) => {
      msg += `${i + 1}. 🌟 ${r.name} - 🎯 ${r.content} - ${r.proxied ? '🟠 ON' : '⚪️ OFF'}\n`;
    });
    ctx.reply(msg, MAIN_MENU);
    return;
  }

  if (text === '❌ Hapus Wildcard') {
    const res = await cfListDNS(session);
    if (!res.success) return ctx.reply('❌ Gagal ambil data:\n' + res.error, MAIN_MENU);
    const wilds = res.records.filter((r) => r.type === 'CNAME' && r.name.startsWith('*'));
    if (!wilds.length) return ctx.reply('Belum ada wildcard.', MAIN_MENU);
    session.step = 'hapus_wildcard_index';
    session.buffer.wildcards = wilds;
    let msg = '❌ Pilih wildcard yang ingin dihapus (ketik nomor):\n';
    wilds.forEach((r, i) => {
      msg += `${i + 1}. 🌟 ${r.name} - 🎯 ${r.content} - ${r.proxied ? '🟠 ON' : '⚪️ OFF'}\n`;
    });
    ctx.reply(msg, MAIN_MENU);
    return;
  }
  if (session.step === 'hapus_wildcard_index') {
    const idx = parseInt(text);
    const wilds = session.buffer.wildcards;
    if (!idx || idx < 1 || idx > wilds.length) {
      session.step = null;
      session.buffer = {};
      return ctx.reply('❌ Pilihan tidak valid.', MAIN_MENU);
    }
    const delId = wilds[idx - 1].id;
    const res = await cfDeleteDNS(session, delId);
    session.step = null;
    session.buffer = {};
    if (res.success) {
      return ctx.reply('✅ Wildcard berhasil dihapus!', MAIN_MENU);
    } else {
      return ctx.reply('❌ Gagal hapus wildcard:\n' + res.error, MAIN_MENU);
    }
  }

  // Unknown
  ctx.reply('🚦 Pilih menu dari keyboard atau gunakan /login.');
});

// ===== Cloudflare API helpers =====
async function cfAddDNS({ apiToken, zoneId, type, name, content, proxied }) {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type,
          name,
          content,
          proxied
        })
      }
    );
    const data = await resp.json();
    if (data.success) return { success: true, result: data.result };
    return { success: false, error: data.errors.map((e) => e.message).join(', ') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function cfListDNS({ apiToken, zoneId }) {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const data = await resp.json();
    if (data.success)
      return { success: true, records: data.result };
    return { success: false, error: data.errors.map((e) => e.message).join(', ') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function cfDeleteDNS({ apiToken, zoneId }, recordId) {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const data = await resp.json();
    if (data.success) return { success: true };
    return { success: false, error: data.errors.map((e) => e.message).join(', ') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

bot.launch();
