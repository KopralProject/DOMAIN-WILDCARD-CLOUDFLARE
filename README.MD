# Cloudflare DNS Telegram Bot

Bot Telegram management DNS Cloudflare:
- Login (API Token | Account ID | Zone ID)
- ➕ Tambah Domain (A record)
- 🌟 Pasang Wildcard (CNAME)
- 📜 List Domain
- ✨ List Wildcard
- ❌ Hapus Wildcard

## Cara pakai

1. Clone repo dan isi `.env` dengan BOT_TOKEN dari [@BotFather](https://t.me/BotFather)
2. Deploy ke Railway atau platform Node.js lain (Railway: connect repo, isi variable BOT_TOKEN)
3. Start bot, login (API Token, Account ID, Zone ID, dapat dari Cloudflare dashboard)
4. Gunakan menu Telegram, semua fitur pakai logo/emoji

## Environment variables

```
BOT_TOKEN=isi_token_bot_telegram_kamu
```

## Note
- Session user in-memory (untuk production besar, bisa kembangkan ke DB/Redis)
- Keamanan: setiap user wajib login Cloudflare masing-masing (multi-user, multi-zone)
