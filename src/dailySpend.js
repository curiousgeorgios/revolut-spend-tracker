/**
 * Core functionality for processing daily spend rate
 */
import { refreshToken, getExpenses, getHistoricalSpendData, saveHistoricalSpendData } from './revolut';
import { calculateDailySpendRate } from './spend';
import { sendNotification, sendSpendRateVisual } from './notification';

/**
 * Process daily spend rate calculation and send notifications
 * 
 * @param {Object} env - Environment variables
 * @param {Object} options - Processing options
 * @param {boolean} options.skipNotification - Whether to skip sending notification
 * @param {string} options.messageId - Message ID to update (if applicable)
 * @returns {Promise<Object>} - Spend rate calculation results
 */
export async function processDailySpendRate(env, options = {}) {
  const { skipNotification = false, messageId = null } = options;
  console.log('Starting daily spend rate calculation...');
  
  try {
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
        if (messageId) {
          // Update existing message with new data
          await sendSpendRateVisual({
            spendRate,
            botToken: env.TELEGRAM_BOT_TOKEN,
            chatId: env.TELEGRAM_CHAT_ID,
            messageId
          });
        } else {
          // Send a new notification
          await sendNotification({
            spendRate,
            botToken: env.TELEGRAM_BOT_TOKEN,
            chatId: env.TELEGRAM_CHAT_ID,
          });
        }
        console.log('Daily spend rate notification sent successfully');
      } catch (error) {
        console.error('Error sending notification:', error.message);
        // Continue despite notification error
      }
    }
    
    return spendRate;
  } catch (error) {
    console.error('Error processing daily spend rate:', error);
    throw error;
  }
}

/**
 * Format spend rate data for JSON response
 * 
 * @param {Object} spendRate - Spend rate calculation results
 * @returns {Object} - Formatted data for API response
 */
export function formatSpendRateForResponse(spendRate) {
  return {
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
  };
} 