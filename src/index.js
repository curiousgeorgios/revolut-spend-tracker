import { generateJwt } from './auth';
import { refreshToken, getExpenses, getHistoricalSpendData, saveHistoricalSpendData } from './revolut';
import { calculateDailySpendRate } from './spend';
import { sendNotification } from './notification';

/**
 * Process daily spend rate calculation and send notifications
 */
async function processDailySpendRate(env, skipNotification = false) {
  console.log('Starting daily spend rate calculation...');
  
  // Check if token needs refresh
  let token = await env.REVOLUT_TOKEN.get('token');
  const tokenExpiry = await env.REVOLUT_TOKEN_EXPIRY.get('expiry');
  
  if (!token || !tokenExpiry || Date.now() > parseInt(tokenExpiry)) {
    console.log('Refreshing token...');
    const authResult = await refreshToken(env);
    token = authResult.token;
  }
  
  // Get historical spend data
  const historicalData = await getHistoricalSpendData(env);
  
  // Get expenses (incremental update by default)
  const expenses = await getExpenses(token, env, { incrementalUpdate: true });
  
  console.log(`Retrieved ${expenses.length} new expenses`);
  
  // Calculate daily spend rate
  const spendRate = calculateDailySpendRate(expenses, historicalData);
  
  // Save updated historical data
  await saveHistoricalSpendData(env, spendRate.historicalData);
  
  // Send notification unless skipped
  if (!skipNotification) {
    try {
      await sendNotification({
        spendRate,
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
      });
      console.log('Daily spend rate notification sent successfully');
    } catch (error) {
      console.error('Error sending notification:', error.message);
      // Continue despite notification error
    }
  }
  
  return spendRate;
}

export default {
  // Handler for scheduled events (cron triggers)
  async scheduled(event, env, ctx) {
    try {
      ctx.waitUntil(processDailySpendRate(env));
    } catch (error) {
      console.error('Error in scheduled task:', error);
    }
  },
  
  // Handler for HTTP requests
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle manual trigger
    if (url.pathname === '/trigger') {
      try {
        const skipNotification = url.searchParams.get('skipNotification') === 'true';
        const result = await processDailySpendRate(env, skipNotification);
        return new Response('Calculation triggered successfully', { status: 200 });
      } catch (error) {
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    }
    
    // Handle calculation with JSON response (no notification)
    if (url.pathname === '/calculate') {
      try {
        const spendRate = await processDailySpendRate(env, true);
        return new Response(JSON.stringify({
          success: true,
          data: {
            dailyRate: spendRate.dailyRate,
            totalAmount: spendRate.totalAmount,
            movingAverage7Day: spendRate.movingAverage7Day,
            movingAverage30Day: spendRate.movingAverage30Day, 
            periodDays: spendRate.periodDays,
            topCategories: spendRate.topCategories,
            currency: spendRate.currency,
            targetSpendAmount: spendRate.targetSpendAmount
          }
        }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Handle Telegram webhook for setting up the bot
    if (url.pathname === '/telegram-webhook') {
      try {
        // Parse the incoming webhook data
        const data = await request.json();
        
        // Check if this is a message from a user
        if (data.message && data.message.chat && data.message.text) {
          const chatId = data.message.chat.id;
          const text = data.message.text;
          
          if (text === '/start') {
            // Respond with instructions
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chat_id: chatId,
                text: `Welcome to the Daily Spend Rate bot! Your chat ID is: ${chatId}\n\nPlease add this chat ID to your worker's environment variables as TELEGRAM_CHAT_ID to receive daily notifications.`,
              })
            });
            
            // Store the chat ID in KV for convenience
            await env.TELEGRAM_CHAT_IDS.put('latest_chat_id', chatId.toString());
            
            return new Response('Welcome message sent', { status: 200 });
          } else if (text === '/test') {
            // Test the notification
            const mockSpendRate = {
              dailyRate: 150.25,
              totalAmount: 4507.50,
              movingAverage7Day: 143.80,
              movingAverage30Day: 162.15,
              periodDays: 30,
              topCategories: [
                { category: 'Dining', amount: 1200, percentage: '26.6' },
                { category: 'Travel', amount: 950, percentage: '21.1' },
                { category: 'Office', amount: 750, percentage: '16.6' },
              ],
              currency: 'AUD',
              targetSpendAmount: 0,  // Already exceeding target
            };
            
            await sendNotification({
              spendRate: mockSpendRate,
              botToken: env.TELEGRAM_BOT_TOKEN,
              chatId,
            });
            
            return new Response('Test notification sent', { status: 200 });
          } else if (text === '/add_cash_expense' || text.startsWith('/add_cash_expense ')) {
            // Add a cash expense
            try {
              // Extract expense details
              const parts = text.replace('/add_cash_expense', '').trim().split(' ');
              
              // Check if we have enough parameters
              if (parts.length < 2) {
                // Send usage instructions with improved visual formatting
                await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: `
<b>ℹ️ HOW TO ADD CASH EXPENSE</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>📝 USAGE</b>
/add_cash_expense AMOUNT CATEGORY [DATE]

<b>📋 EXAMPLES</b>
/add_cash_expense 25.50 Groceries
/add_cash_expense 42 Restaurant 2025-03-15

<i>Add [DATE] in YYYY-MM-DD format (optional, defaults to today)</i>
`,
                    parse_mode: 'HTML'
                  })
                });
                return new Response('Usage instructions sent', { status: 200 });
              }
              
              // Parse amount
              const amount = parseFloat(parts[0]);
              if (isNaN(amount) || amount <= 0) {
                throw new Error('Invalid amount. Please provide a positive number.');
              }
              
              // Get category
              const category = parts[1];
              
              // Get date (optional, default to today)
              let expenseDate;
              if (parts.length >= 3 && parts[2].match(/^\d{4}-\d{2}-\d{2}$/)) {
                expenseDate = parts[2];
              } else {
                expenseDate = new Date().toISOString().split('T')[0];
              }
              
              // Get currency from environment or default to AUD
              const currency = env.DEFAULT_CURRENCY || 'AUD';
              
              // Create expense object
              const cashExpense = {
                id: `cash_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                state: 'COMPLETED',
                spent_amount: {
                  amount: amount,
                  currency: currency
                },
                expense_date: expenseDate,
                category: 'Cash',
                merchant: {
                  category: category
                },
                is_manual_entry: true
              };
              
              // Get historical data
              const historicalData = await getHistoricalSpendData(env);
              
              // Add the new cash expense
              historicalData.expenses.push(cashExpense);
              
              // Update daily rates
              const dateKey = expenseDate;
              if (!historicalData.dailyRates[dateKey]) {
                historicalData.dailyRates[dateKey] = 0;
              }
              historicalData.dailyRates[dateKey] += amount;
              
              // Save updated data
              await saveHistoricalSpendData(env, historicalData);
              
              // Format response amount
              const formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency
              }).format(amount);
              
              // Send confirmation with improved visual formatting
              await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `
<b>✅ EXPENSE ADDED SUCCESSFULLY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>💰 Amount:</b> ${formattedAmount}
<b>📂 Category:</b> ${category}
<b>📅 Date:</b> ${expenseDate}

<i>This expense has been added to your spending history.</i>
`,
                  parse_mode: 'HTML'
                })
              });
              
              return new Response('Cash expense added', { status: 200 });
            } catch (error) {
              // Send error message with improved visual formatting
              await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `
<b>❌ ERROR</b>
━━━━━━━━━━━━━━━━━━━━━━

${error.message}

<b>📝 CORRECT USAGE</b>
/add_cash_expense AMOUNT CATEGORY [DATE]

<b>📋 EXAMPLES</b>
/add_cash_expense 25.50 Groceries
/add_cash_expense 42 Restaurant 2025-03-15
`,
                  parse_mode: 'HTML'
                })
              });
              
              return new Response(`Error adding cash expense: ${error.message}`, { status: 200 });
            }
          }
        }
        
        return new Response('Webhook received', { status: 200 });
      } catch (error) {
        return new Response(`Telegram webhook error: ${error.message}`, { status: 500 });
      }
    }
    
    // Set up a Telegram webhook when requested
    if (url.pathname === '/setup-webhook') {
      try {
        // Get webhook URL from query parameters or construct it
        const webhookUrl = url.searchParams.get('url') || 
          `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}/telegram-webhook`;
        
        // Make sure we have a bot token
        const botToken = env.TELEGRAM_BOT_TOKEN;
        if (!botToken || botToken === 'your_telegram_bot_token') {
          return new Response(JSON.stringify({
            success: false,
            error: 'No valid bot token configured. Please set TELEGRAM_BOT_TOKEN in your environment variables.'
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Register webhook with Telegram
        const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: webhookUrl,
          })
        });
        
        const result = await response.json();
        return new Response(JSON.stringify(result), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(`Error setting up webhook: ${error.message}`, { status: 500 });
      }
    }
    
    // Show a simple HTML landing page with available endpoints
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Spend Rate Tracker</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .endpoint { background: #f5f5f5; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
        .endpoint h2 { margin-top: 0; }
        .endpoint code { background: #e0e0e0; padding: 3px 5px; border-radius: 3px; }
        .bot-commands { background: #e8f4ff; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>Daily Spend Rate Tracker</h1>
      <p>This service calculates your daily spend rate from Revolut Business expenses.</p>
      
      <div class="endpoint">
        <h2>/trigger</h2>
        <p>Manually trigger a calculation and send a notification.</p>
        <p>Example: <code>${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}/trigger</code></p>
      </div>
      
      <div class="endpoint">
        <h2>/calculate</h2>
        <p>Calculate spend rate and return JSON data (no notification sent).</p>
        <p>Example: <code>${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}/calculate</code></p>
      </div>
      
      <div class="endpoint">
        <h2>/setup-webhook</h2>
        <p>Set up the Telegram webhook for receiving bot commands.</p>
        <p>Example: <code>${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}/setup-webhook</code></p>
      </div>
      
      <div class="bot-commands">
        <h2>Telegram Bot Commands</h2>
        <p>The Telegram bot supports the following commands:</p>
        <ul>
          <li><code>/start</code> - Initialize the bot and get your chat ID</li>
          <li><code>/test</code> - Send a test notification to verify setup</li>
          <li><code>/add_cash_expense AMOUNT CATEGORY [DATE]</code> - Add a manual cash expense
            <ul>
              <li>Example: <code>/add_cash_expense 25.50 Groceries</code></li>
              <li>Example with date: <code>/add_cash_expense 42 Restaurant 2025-03-15</code></li>
            </ul>
          </li>
        </ul>
      </div>
    </body>
    </html>
    `;
    
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
};