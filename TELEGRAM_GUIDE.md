# Telegram Bot User Guide

This guide explains how to use the Daily Spend Rate Tracker Telegram bot.

## Getting Started

### 1. Find your bot

Search for your bot by the username you created in BotFather (e.g., `@your_daily_spend_bot`).

### 2. Start the conversation

Send the `/start` command to initialize the bot.

```
/start
```

The bot will respond with a welcome message and provide your chat ID:

```
Welcome to the Daily Spend Rate bot! Your chat ID is: 123456789

Please add this chat ID to your worker's environment variables as TELEGRAM_CHAT_ID to receive daily notifications.
```

### 3. Get your spending statistics

After setting up your chat ID in the worker configuration, send the `/stats` or `/update` command:

```
/stats
```

The bot will respond with a visual chart showing your daily spending for the last 14 days, along with key statistics:

![Daily Spend Stats Example](https://i.imgur.com/example1.png)

The statistics include:
- Daily spending rate
- Total spending amount
- 7-day and 30-day averages
- Target information (how much you need to spend to reach your daily target or how much you've exceeded it)

## Updating Your Data

### Automatic Updates

The bot will automatically send an updated chart every 24 hours (at 6:00 AM UTC by default).

### Manual Updates

You can update your data at any time by:

1. Pressing the "🔄 Update Now" button under any statistics message
2. Sending the `/stats` or `/update` command to generate a new chart

When you press the "Update Now" button, the bot will:
- Acknowledge your request ("Updating spend data...")
- Fetch the latest data from Revolut
- Update the existing chart and statistics

## Testing

If you want to test the bot without affecting your actual data, use the `/test` command:

```
/test
```

The bot will send a sample chart with test data:

![Test Stats Example](https://i.imgur.com/example2.png)

## Recording Cash Expenses

If you make cash payments that aren't tracked in Revolut, you can record them using the `/add_cash_expense` command:

```
/add_cash_expense AMOUNT CATEGORY [DATE]
```

Examples:
- `/add_cash_expense 25.50 Groceries` - Records a $25.50 expense in the Groceries category for today
- `/add_cash_expense 42 Restaurant 2023-05-15` - Records a $42 expense in the Restaurant category for May 15, 2023

After adding a cash expense, use the "Update Now" button to see it reflected in your stats.

## Troubleshooting

If you encounter issues:

1. Ensure your worker is deployed and running
2. Check that your Telegram chat ID is correctly set in the worker's environment variables
3. Verify that the Telegram webhook is properly configured
4. Try the `/test` command to see if the bot is responding

For persistent issues, check the Cloudflare Workers logs for error messages.

## Data Privacy

- All your spending data is processed within Cloudflare Workers and stored in Cloudflare KV
- Data is only sent to your specified Telegram chat
- No data is shared with third parties

## Customization

You can customize the bot's behavior by modifying the worker code:
- Change the target daily spend amount (default: $150/day)
- Adjust the automatic update schedule
- Customize the chart appearance
- Add or remove statistics shown in updates 