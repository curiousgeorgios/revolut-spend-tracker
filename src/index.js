/**
 * Daily Spend Rate - Main entry point
 */
import { processDailySpendRate } from './dailySpend';
import { handleTriggerRoute, handleCalculateRoute, handleTelegramWebhook } from './routes';

// Store the last sent message ID for updates
const LAST_MESSAGE_KEY = 'last_message_id';

export default {
  // Handler for scheduled events (cron triggers)
  async scheduled(event, env, ctx) {
    try {
      // Get the last message ID for updating
      const lastMessageId = await env.TELEGRAM_STATE.get(LAST_MESSAGE_KEY);
      ctx.waitUntil(processDailySpendRate(env, { messageId: lastMessageId }));
    } catch (error) {
      console.error('Error in scheduled task:', error);
    }
  },
  
  // Handler for HTTP requests
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle different routes
    switch (url.pathname) {
      case '/trigger':
        return handleTriggerRoute(request, env);
        
      case '/calculate':
        return handleCalculateRoute(request, env);
        
      case '/telegram-webhook':
        return handleTelegramWebhook(request, env, ctx);
        
      default:
        // Default response for unknown routes
        return new Response('Not found', { status: 404 });
    }
  }
}; 