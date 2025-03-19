import { generateJwt } from './auth';

/**
 * Refresh the Revolut API access token
 * 
 * @param {Object} env - Environment variables
 * @returns {Object} - Token information
 */
export async function refreshToken(env) {
  try {
    // Generate a fresh JWT for authentication
    const jwt = await generateJwt(env);
    
    // Get refresh token from KV store or use initial refresh token
    let refreshToken = await env.REVOLUT_REFRESH_TOKEN.get('refresh_token');
    const initialRefreshToken = env.REVOLUT_INITIAL_REFRESH_TOKEN;
    
    // Use initial refresh token if no stored refresh token exists
    if (!refreshToken && initialRefreshToken) {
      refreshToken = initialRefreshToken;
    }
    
    if (!refreshToken) {
      throw new Error('No refresh token available. Please provide REVOLUT_INITIAL_REFRESH_TOKEN.');
    }
    
    // Exchange refresh token for access token
    const response = await fetch('https://b2b.revolut.com/api/1.0/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: jwt,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }
    
    const data = await response.json();
    
    // Store token and expiry in KV
    const expiryTime = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // Expire 5 minutes early for safety
    await env.REVOLUT_TOKEN.put('token', data.access_token);
    await env.REVOLUT_TOKEN_EXPIRY.put('expiry', expiryTime.toString());
    
    // If we got a new refresh token (some APIs return it), store it
    if (data.refresh_token) {
      await env.REVOLUT_REFRESH_TOKEN.put('refresh_token', data.refresh_token);
    }
    
    return {
      token: data.access_token,
      expiryTime,
    };
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
}

/**
 * Get expenses from Revolut API
 * 
 * @param {string} token - Access token 
 * @param {Object} env - Environment variables
 * @param {Object} options - Options for fetching expenses
 * @returns {Array} - List of expenses
 */
export async function getExpenses(token, env, options = {}) {
  // Get last processed date from KV or use default (30 days ago)
  let lastProcessedDate = await env.LAST_PROCESSED_DATE.get('last_date');
  const today = new Date();
  
  let fromDate;
  if (lastProcessedDate && options.incrementalUpdate) {
    // If we have a last processed date and want incremental updates,
    // start from the day after last processed date
    fromDate = new Date(lastProcessedDate);
    fromDate.setDate(fromDate.getDate() + 1);
  } else {
    // Otherwise use provided fromDate or default to 30 days ago
    fromDate = options.fromDate || new Date(today);
    if (!options.fromDate) {
      fromDate.setDate(fromDate.getDate() - 30);
    }
  }
  
  // Use provided toDate or default to today
  const toDate = options.toDate || today;
  
  // Format dates as YYYY-MM-DD
  const formattedFromDate = fromDate.toISOString().split('T')[0];
  const formattedToDate = toDate.toISOString().split('T')[0];
  
  // Build query parameters
  const queryParams = new URLSearchParams({
    from: formattedFromDate,
    to: formattedToDate,
  });
  
  // Add count parameter if provided
  if (options.count) {
    queryParams.append('count', options.count);
  }
  
  try {
    const response = await fetch(`https://b2b.revolut.com/api/1.0/expenses?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get expenses: ${error}`);
    }
    
    const expenses = await response.json();
    
    // Update last processed date to current date
    await env.LAST_PROCESSED_DATE.put('last_date', toDate.toISOString());
    
    return expenses;
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw error;
  }
}

/**
 * Get historical spend data from KV store
 * 
 * @param {Object} env - Environment variables
 * @returns {Object} - Historical spend data
 */
export async function getHistoricalSpendData(env) {
  const data = await env.HISTORICAL_SPEND_DATA.get('spendData', { type: 'json' });
  return data || { expenses: [], dailyRates: {} };
}

/**
 * Save historical spend data to KV store
 * 
 * @param {Object} env - Environment variables
 * @param {Object} data - Historical spend data to save
 * @returns {Promise<void>}
 */
export async function saveHistoricalSpendData(env, data) {
  await env.HISTORICAL_SPEND_DATA.put('spendData', JSON.stringify(data));
}