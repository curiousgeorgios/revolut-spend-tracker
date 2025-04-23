/**
 * Send daily spend rate notification via Telegram bot
 * 
 * @param {Object} options
 * @param {Object} options.spendRate - Spend rate calculation results
 * @param {string} options.botToken - Telegram bot token
 * @param {string} options.chatId - Telegram chat ID to send messages to
 * @returns {Promise<void>}
 */
export async function sendNotification({ spendRate, botToken, chatId }) {
  // Check if we have valid credentials
  if (!botToken || botToken === "your_telegram_bot_token") {
    console.warn("No valid Telegram bot token provided. Skipping notification.");
    console.log("To get started with Telegram notifications:");
    console.log("1. Create a bot with BotFather on Telegram");
    console.log("2. Add the bot token to your .dev.vars file");
    return false;
  }
  
  if (!chatId || chatId === "your_telegram_chat_id") {
    console.warn("No valid Telegram chat ID provided. Skipping notification.");
    console.log("First set up the bot token, then use /start command with your bot to get the chat ID");
    return false;
  }
  
  // Send the visual chart with an update button
  return await sendSpendRateVisual({ spendRate, botToken, chatId });
}

/**
 * Generate a URL for a spending chart using QuickChart API
 * 
 * @param {Object} spendRate - Spend rate calculation results
 * @returns {string} - URL to the generated chart image
 */
function generateChartUrl(spendRate) {
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
          text: 'Daily Spend Rate (Last 14 Days)',
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
            text: `${spendRate.currency || 'AUD'}`,
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
 * Send a visual representation of spend rate data with update button
 * 
 * @param {Object} options
 * @param {Object} options.spendRate - Spend rate calculation results
 * @param {string} options.botToken - Telegram bot token
 * @param {string} options.chatId - Telegram chat ID to send messages to
 * @param {string} options.messageId - Optional message ID to edit (for updates)
 * @returns {Promise<boolean>} - Success status
 */
export async function sendSpendRateVisual({ spendRate, botToken, chatId, messageId = null }) {
  try {
    // Validate the bot token format
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      throw new Error("Invalid bot token format. Bot tokens should be in the format 'number:string'.");
    }
    
    // Generate chart URL
    const chartUrl = generateChartUrl(spendRate);
    
    // Create caption text with key stats
    const captionText = `
<b>💰 DAILY SPEND STATS</b>
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

<i>Last updated: ${new Date().toISOString().substring(0, 16).replace('T', ' ')}</i>
`;
    
    // Create inline keyboard for update button
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Update Now', callback_data: 'update_now' }
        ]
      ]
    };
    
    // Determine if we're sending a new message or editing an existing one
    const endpoint = messageId 
      ? `https://api.telegram.org/bot${botToken}/editMessageMedia` 
      : `https://api.telegram.org/bot${botToken}/sendPhoto`;
    
    // Prepare request body
    let requestBody;
    
    if (messageId) {
      // Editing existing message
      requestBody = {
        chat_id: chatId,
        message_id: messageId,
        media: {
          type: 'photo',
          media: chartUrl,
          caption: captionText,
          parse_mode: 'HTML'
        },
        reply_markup: inlineKeyboard
      };
    } else {
      // Sending new message
      requestBody = {
        chat_id: chatId,
        photo: chartUrl,
        caption: captionText,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      };
    }
    
    // Send or edit message
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error("Telegram API Error:", responseData);
      throw new Error(`Failed to send Telegram notification: ${JSON.stringify(responseData)}`);
    }
    
    console.log("Telegram visual notification sent successfully!");
    return true;
  } catch (error) {
    console.error('Error sending Telegram visual notification:', error);
    throw error;
  }
}