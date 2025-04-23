/**
 * Telegram-related functionality for the Daily Spend Rate app
 */

/**
 * Handle /start command
 * 
 * @param {Object} env - Environment variables
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<void>}
 */
export async function handleStartCommand(env, chatId) {
  // Send welcome message with setup instructions
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
    text: `Welcome to the Daily Spend Rate bot! Your chat ID is: ${chatId}\n\nPlease add this chat ID to your worker's environment variables as TELEGRAM_CHAT_ID to receive daily notifications.`
  });
  
  // Store the chat ID in KV for convenience
  await env.TELEGRAM_CHAT_IDS.put('latest_chat_id', chatId.toString());
}

/**
 * Handle /stats or /update command
 * 
 * @param {Object} env - Environment variables
 * @param {string} chatId - Telegram chat ID
 * @param {Function} processDailySpendRate - Function to process daily spend rate
 * @returns {Promise<void>}
 */
export async function handleStatsCommand(env, chatId, processDailySpendRate) {
  try {
    const spendRate = await processDailySpendRate(env, { skipNotification: true });
    
    // Send a new visual message
    const response = await sendTelegramChart(env.TELEGRAM_BOT_TOKEN, chatId, spendRate);
    
    if (response.ok && response.result && response.result.message_id) {
      // Save this message ID for future updates
      await env.TELEGRAM_STATE.put('last_message_id', response.result.message_id.toString());
    }
  } catch (error) {
    console.error('Error generating stats:', error);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
      text: `Error generating spend stats: ${error.message}`
    });
  }
}

/**
 * Handle /test command
 * 
 * @param {Object} env - Environment variables
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<void>}
 */
export async function handleTestCommand(env, chatId) {
  try {
    const mockSpendRate = createMockSpendRate();
    
    // Send the test message
    const response = await sendTelegramChart(
      env.TELEGRAM_BOT_TOKEN, 
      chatId, 
      mockSpendRate, 
      'TEST SPEND STATS', 
      'Test Data - Not Real Spending'
    );
    
    if (response.ok && response.result && response.result.message_id) {
      // Save this message ID for future updates
      await env.TELEGRAM_STATE.put('last_message_id', response.result.message_id.toString());
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
      text: `Error sending test notification: ${error.message}`
    });
  }
}

/**
 * Handle /add_cash_expense command
 * 
 * @param {Object} env - Environment variables
 * @param {string} chatId - Telegram chat ID
 * @param {string} text - Command text
 * @returns {Promise<void>}
 */
export async function handleAddCashExpenseCommand(env, chatId, text) {
  try {
    // Extract expense details
    const parts = text.replace('/add_cash_expense', '').trim().split(' ');
    
    // Check if we have enough parameters
    if (parts.length < 2) {
      // Send usage instructions
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
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
      });
      return;
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
    
    // Create and add the expense
    await addCashExpense(env, amount, category, expenseDate, currency);
    
    // Format response amount
    const formattedAmount = formatCurrency(amount, currency);
    
    // Send confirmation
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
      text: `
<b>✅ EXPENSE ADDED SUCCESSFULLY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>💰 Amount:</b> ${formattedAmount}
<b>📂 Category:</b> ${category}
<b>📅 Date:</b> ${expenseDate}

<i>This expense has been added to your spending history.</i>
`,
      parse_mode: 'HTML'
    });
  } catch (error) {
    // Send error message
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
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
    });
  }
}

/**
 * Handle update_now callback query
 * 
 * @param {Object} env - Environment variables 
 * @param {Object} callbackQuery - Callback query data
 * @param {Function} processDailySpendRate - Function to process daily spend rate
 * @returns {Promise<void>}
 */
export async function handleUpdateCallback(env, callbackQuery, processDailySpendRate) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  
  // Acknowledge the callback query
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callback_query_id: callbackQuery.id,
      text: 'Updating spend data...'
    })
  });
  
  try {
    // Process the data and update the message
    await processDailySpendRate(env, { messageId });
    
    // Save this message ID for future updates
    await env.TELEGRAM_STATE.put('last_message_id', messageId.toString());
  } catch (error) {
    console.error('Error updating spend data:', error);
    
    // Send error message
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, {
      text: `Error updating spend data: ${error.message}`,
      reply_to_message_id: messageId
    });
  }
}

/**
 * Add a cash expense to historical data
 * 
 * @param {Object} env - Environment variables
 * @param {number} amount - Expense amount
 * @param {string} category - Expense category
 * @param {string} expenseDate - Expense date in YYYY-MM-DD format
 * @param {string} currency - Currency code
 * @returns {Promise<void>}
 */
async function addCashExpense(env, amount, category, expenseDate, currency) {
  const { getHistoricalSpendData, saveHistoricalSpendData } = await import('./revolut');
  
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
}

/**
 * Send a message via Telegram API
 * 
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Telegram chat ID
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} - API response
 */
export async function sendTelegramMessage(botToken, chatId, messageData) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      ...messageData
    })
  });
  
  return await response.json();
}

/**
 * Send a chart with spend data via Telegram
 * 
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Telegram chat ID
 * @param {Object} spendRate - Spend rate data
 * @param {string} title - Optional title for the chart
 * @param {string} footer - Optional footer text
 * @returns {Promise<Object>} - API response
 */
export async function sendTelegramChart(botToken, chatId, spendRate, title = 'DAILY SPEND STATS', footer = '') {
  const chartUrl = generateChartUrl(spendRate, title);
  
  const captionText = generateCaptionText(spendRate, title, footer);
  
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      photo: chartUrl,
      caption: captionText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Update Now', callback_data: 'update_now' }]
        ]
      }
    })
  });
  
  return await response.json();
}

/**
 * Generate a URL for the spend chart
 * 
 * @param {Object} spendRate - Spend rate data
 * @param {string} title - Chart title
 * @returns {string} - Chart URL
 */
function generateChartUrl(spendRate, title = 'Daily Spend Rate') {
  // Get the last 14 days of data
  const dailyRates = spendRate.historicalData?.dailyRates || {};
  const dates = Object.keys(dailyRates).sort();
  const recentDates = dates.slice(-14);
  
  // Extract data for the chart
  const chartData = recentDates.map(date => dailyRates[date] || 0);
  const chartLabels = recentDates.map(date => {
    // Format date as DD/MM
    const [year, month, day] = date.split('-');
    return `${day}/${month}`;
  });
  
  // Create target line data (constant value for all dates)
  const targetData = Array(recentDates.length).fill(150);
  
  // Define modern color palette
  const primaryColor = '#7C3AED'; // Purple
  const primaryGradient = ['rgba(124, 58, 237, 0.8)', 'rgba(124, 58, 237, 0.2)']; // Purple gradient
  const targetColor = '#F43F5E'; // Rose/Pink
  
  // Calculate gradient stops for better visual effect
  const gradientStops = chartData.map((value, index) => {
    return {
      stop: index / (chartData.length - 1),
      color: primaryGradient[0]
    };
  });
  
  // Add final gradient stop
  gradientStops.push({
    stop: 1,
    color: primaryGradient[1]
  });
  
  // Define chart configuration
  const chartConfig = {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Daily Spend',
          data: chartData,
          backgroundColor: function(context) {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            
            if (!chartArea) {
              return primaryColor;
            }
            
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, primaryGradient[1]);
            gradient.addColorStop(1, primaryGradient[0]);
            
            return gradient;
          },
          borderColor: 'transparent',
          borderWidth: 0,
          borderRadius: 6,
          barThickness: 12,
          maxBarThickness: 16
        },
        {
          label: 'Target ($150/day)',
          data: targetData,
          type: 'line',
          fill: false,
          borderColor: targetColor,
          borderWidth: 2,
          borderDash: [3, 3],
          pointRadius: 0,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 15,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20,
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 12
            }
          }
        },
        title: {
          display: true,
          text: title,
          font: {
            family: 'Inter, system-ui, sans-serif',
            size: 16,
            weight: 'bold'
          },
          padding: {
            top: 10,
            bottom: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          titleFont: {
            family: 'Inter, system-ui, sans-serif',
            size: 13
          },
          bodyFont: {
            family: 'Inter, system-ui, sans-serif',
            size: 12
          },
          padding: 12,
          cornerRadius: 6,
          caretSize: 6,
          displayColors: false,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += `$${context.parsed.y.toFixed(2)}`;
              }
              return label;
            }
          }
        }
      },
      layout: {
        padding: {
          left: 5,
          right: 15,
          top: 5,
          bottom: 5
        }
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            padding: 8,
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 11
            }
          }
        },
        y: {
          position: 'right',
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.06)',
            drawBorder: false,
            lineWidth: 1
          },
          ticks: {
            padding: 10,
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 11
            },
            callback: (value) => `$${value}`
          },
          title: {
            display: true,
            text: spendRate.currency || 'AUD',
            font: {
              family: 'Inter, system-ui, sans-serif',
              size: 12
            }
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  };
  
  // Encode chart configuration as URL
  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?c=${encodedConfig}&width=600&height=350&devicePixelRatio=2.0&backgroundColor=white`;
}

/**
 * Generate caption text for Telegram message
 * 
 * @param {Object} spendRate - Spend rate data
 * @param {string} title - Message title
 * @param {string} footer - Optional footer text
 * @returns {string} - Formatted caption text
 */
function generateCaptionText(spendRate, title, footer = '') {
  return `
<b>💰 ${title}</b>
━━━━━━━━━━━━━━━━━━━━━━

📊 <b>Period:</b> Last ${spendRate.periodDays} days
📈 <b>Daily Rate:</b> ${formatCurrency(spendRate.dailyRate, spendRate.currency)}
💵 <b>Total:</b> ${formatCurrency(spendRate.totalAmount, spendRate.currency)}

<b>📅 AVERAGES</b>
┌─ 7-Day: ${formatCurrency(spendRate.movingAverage7Day, spendRate.currency)}
└─ 30-Day: ${formatCurrency(spendRate.movingAverage30Day, spendRate.currency)}

<b>🎯 TARGET ($150/day)</b>
${spendRate.targetSpendAmount > 0 
  ? `You need to spend <b>${formatCurrency(spendRate.targetSpendAmount, spendRate.currency)}</b> today to reach target`
  : `Target exceeded by <b>${formatCurrency(Math.abs(spendRate.targetSpendAmount), spendRate.currency)}</b>`}
${footer ? `\n<b>${footer}</b>` : ''}

<i>Last updated: ${new Date().toISOString().substring(0, 16).replace('T', ' ')}</i>
`;
}

/**
 * Format currency for display
 * 
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} - Formatted currency string
 */
function formatCurrency(amount, currency = 'AUD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (error) {
    console.error(`Error formatting currency: ${error.message}`);
    // Fallback formatting
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Create mock spend rate data for testing
 * 
 * @returns {Object} - Mock spend rate data
 */
function createMockSpendRate() {
  return {
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
    historicalData: {
      dailyRates: {
        // Mock some daily rates for the chart
        '2023-01-01': 120,
        '2023-01-02': 175,
        '2023-01-03': 150,
        '2023-01-04': 130,
        '2023-01-05': 190,
        '2023-01-06': 100,
        '2023-01-07': 145,
      }
    }
  };
} 