# Daily Spend Rate Tracker

A Cloudflare Workers application that calculates your daily spend rate from Revolut Business expenses and sends you notifications via Telegram.

## How It Works

1. The worker runs on a daily cron schedule (7:00 UTC by default).
2. It authenticates with Revolut Business API using JWT and refreshes tokens as needed.
3. Fetches expense data incrementally, storing historical data in KV storage.
4. Calculates your daily spend rate, 7-day and 30-day moving averages, and top spending categories.
5. Sends you a detailed notification via Telegram bot.

## Setup

### 1. Revolut Business API Setup

1. Generate a certificate for the Revolut Business API:
   ```bash
   openssl genrsa -out privatecert.pem 2048
   openssl req -new -x509 -key privatecert.pem -out publiccert.cer -days 365
   ```

2. Register this certificate in your Revolut Business account under Developer Settings.

3. Get the Client ID from your Revolut Business account.

4. Complete the OAuth authorization flow as documented in Revolut's API documentation to obtain an initial refresh token.

### 2. Telegram Bot Setup

1. Create a new Telegram bot by messaging [@BotFather](https://t.me/botfather) on Telegram.
   - Send `/newbot` to start the process
   - Choose a name and username for your bot
   - BotFather will give you a token - save this as your `TELEGRAM_BOT_TOKEN`

2. After deploying your worker, set up the webhook:
   - Visit `https://your-worker.your-subdomain.workers.dev/setup-webhook`
   - This registers your worker URL with Telegram

3. Start a conversation with your bot:
   - Find your bot on Telegram by the username you chose
   - Send `/start` to the bot
   - The bot will reply with your chat ID
   - Save this chat ID as your `TELEGRAM_CHAT_ID` in the environment variables

### 3. Cloudflare Workers Setup

1. Create KV namespaces in Cloudflare Workers:
   - `REVOLUT_TOKEN` - Stores the current access token
   - `REVOLUT_TOKEN_EXPIRY` - Stores when the token expires
   - `REVOLUT_REFRESH_TOKEN` - Stores the refresh token
   - `LAST_PROCESSED_DATE` - Tracks the last date expenses were processed
   - `HISTORICAL_SPEND_DATA` - Stores historical expense data for analysis
   - `TELEGRAM_CHAT_IDS` - Stores Telegram chat IDs

2. Update the `.dev.vars` file with your credentials:
   - `REVOLUT_CLIENT_ID` - From Revolut Business dashboard
   - `REVOLUT_ISSUER` - Your domain name as registered with Revolut
   - `REVOLUT_PRIVATE_KEY` - The private key generated in step 1
   - `REVOLUT_INITIAL_REFRESH_TOKEN` - The initial refresh token from the OAuth flow
   - `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
   - `TELEGRAM_CHAT_ID` - Your Telegram chat ID
   - `DEFAULT_CURRENCY` - (Optional) Default currency for cash expenses (e.g., "AUD" - defaults to AUD if not specified)

3. Update `wrangler.toml` with your KV namespace IDs.

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Telegram Bot Commands

- `/start` - Get your chat ID and setup instructions
- `/test` - Receive a test notification with sample data
- `/add_cash_expense AMOUNT CATEGORY [DATE]` - Add a manual cash expense that wasn't made through Revolut
  - Example: `/add_cash_expense 25.50 Groceries`
  - Example with date: `/add_cash_expense 42 Restaurant 2025-03-15`

## Manual Trigger

You can manually trigger a calculation by making a request to:
```
https://your-worker.your-subdomain.workers.dev/trigger
```

## Features

- Efficient token refresh using JWT authentication
- Incremental expense data retrieval
- Historical data tracking
- Moving average calculations (7-day and 30-day)
- Category-based expense analysis
- Telegram notifications with formatted messages
- Manual cash expense tracking via Telegram commands