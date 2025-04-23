/**
 * Route handlers for the Daily Spend Rate API
 */
import { processDailySpendRate, formatSpendRateForResponse } from './dailySpend';
import { 
  handleStartCommand, 
  handleStatsCommand, 
  handleTestCommand, 
  handleAddCashExpenseCommand,
  handleUpdateCallback 
} from './telegram';

/**
 * Handle /trigger endpoint - manually trigger spend rate calculation
 * 
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment variables
 * @returns {Promise<Response>} - HTTP response
 */
export async function handleTriggerRoute(request, env) {
  try {
    const url = new URL(request.url);
    const skipNotification = url.searchParams.get('skipNotification') === 'true';
    const lastMessageId = await env.TELEGRAM_STATE.get('last_message_id');
    
    await processDailySpendRate(env, { 
      skipNotification,
      messageId: skipNotification ? null : lastMessageId
    });
    
    return new Response('Calculation triggered successfully', { status: 200 });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

/**
 * Handle /calculate endpoint - get spend rate as JSON
 * 
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment variables
 * @returns {Promise<Response>} - HTTP response with JSON data
 */
export async function handleCalculateRoute(request, env) {
  try {
    const spendRate = await processDailySpendRate(env, { skipNotification: true });
    const responseData = formatSpendRateForResponse(spendRate);
    
    return new Response(JSON.stringify(responseData), { 
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

/**
 * Handle Telegram webhook for bot interactions
 * 
 * @param {Request} request - HTTP request
 * @param {Object} env - Environment variables 
 * @param {Object} ctx - Execution context
 * @returns {Promise<Response>} - HTTP response
 */
export async function handleTelegramWebhook(request, env, ctx) {
  try {
    // Parse the incoming webhook data
    const data = await request.json();
    
    // Check if this is a callback query (button press)
    if (data.callback_query) {
      const callbackQuery = data.callback_query;
      const callbackData = callbackQuery.data;
      
      if (callbackData === 'update_now') {
        // Process update_now button press
        ctx.waitUntil(handleUpdateCallback(env, callbackQuery, processDailySpendRate));
        return new Response('Processing callback query', { status: 200 });
      }
    }
    
    // Check if this is a message from a user
    if (data.message && data.message.chat && data.message.text) {
      const chatId = data.message.chat.id;
      const text = data.message.text;
      
      // Handle different commands
      if (text === '/start') {
        ctx.waitUntil(handleStartCommand(env, chatId));
        return new Response('Welcome message sent', { status: 200 });
      } 
      else if (text === '/stats' || text === '/update') {
        ctx.waitUntil(handleStatsCommand(env, chatId, processDailySpendRate));
        return new Response('Stats command received', { status: 200 });
      } 
      else if (text === '/test') {
        ctx.waitUntil(handleTestCommand(env, chatId));
        return new Response('Test notification sent', { status: 200 });
      } 
      else if (text === '/add_cash_expense' || text.startsWith('/add_cash_expense ')) {
        ctx.waitUntil(handleAddCashExpenseCommand(env, chatId, text));
        return new Response('Cash expense command received', { status: 200 });
      }
    }
    
    // Default webhook response
    return new Response('Webhook received', { status: 200 });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response(`Webhook error: ${error.message}`, { status: 500 });
  }
} 