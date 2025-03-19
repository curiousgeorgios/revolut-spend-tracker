/**
 * Calculate daily spend rate based on expenses
 * 
 * @param {Array} expenses - List of expenses 
 * @param {Object} historicalData - Previously stored spend data
 * @returns {Object} - Daily spend rate information
 */
export function calculateDailySpendRate(expenses, historicalData = { expenses: [], dailyRates: {} }) {
  console.log(`Processing ${expenses.length} expenses...`);
  
  // Combine historical expenses with new ones
  const allExpenses = [...historicalData.expenses];
  
  // Add only new expenses (avoid duplicates)
  const existingIds = new Set(allExpenses.map(exp => exp.id));
  for (const expense of expenses) {
    if (!existingIds.has(expense.id)) {
      allExpenses.push(expense);
      existingIds.add(expense.id);
    }
  }
  
  // Log some expense examples for debugging
  if (expenses.length > 0) {
    console.log('Example expense:');
    console.log(`ID: ${expenses[0].id}`);
    console.log(`State: ${expenses[0].state}`);
    console.log(`Spent amount: ${JSON.stringify(expenses[0].spent_amount)}`);
    console.log(`Date: ${expenses[0].expense_date || expenses[0].created_at}`);
  }
  
  // Count all expenses with valid amounts
  // (Not filtering by state anymore since we want to include all expense types including "missing_info")
  const validExpenses = allExpenses.filter(exp => {
    const hasAmount = exp.spent_amount && typeof exp.spent_amount.amount === 'number';
    return hasAmount;
  });
  
  console.log(`Found ${validExpenses.length} valid expenses to count`);
  
  // Calculate total expense
  const totalAmount = validExpenses.reduce((total, exp) => {
    return total + Math.abs(parseFloat(exp.spent_amount?.amount || 0));
  }, 0);
  
  console.log(`Total amount: ${totalAmount}`);
  
  // Get date range for calculation
  const dates = validExpenses.map(exp => new Date(exp.expense_date || exp.created_at));
  const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : new Date();
  const newestDate = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();
  
  // Calculate days between
  const daysDiff = Math.max(1, Math.ceil((newestDate - oldestDate) / (1000 * 60 * 60 * 24)));
  
  // Calculate daily average
  const dailyRate = totalAmount / daysDiff;
  
  // Group expenses by day
  const expensesByDay = validExpenses.reduce((acc, exp) => {
    const date = new Date(exp.expense_date || exp.created_at).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += Math.abs(parseFloat(exp.spent_amount?.amount || 0));
    return acc;
  }, {});
  
  // Add daily totals to historical data
  const updatedDailyRates = { ...historicalData.dailyRates };
  Object.entries(expensesByDay).forEach(([date, amount]) => {
    updatedDailyRates[date] = amount;
  });
  
  // Calculate 7-day moving average
  const movingAverage7Day = calculateMovingAverage(updatedDailyRates, 7);
  
  // Calculate 30-day moving average
  const movingAverage30Day = calculateMovingAverage(updatedDailyRates, 30);
  
  // Get expenses by category
  const categorized = validExpenses.reduce((acc, exp) => {
    const category = exp.merchant?.category || exp.category || exp.merchant || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = 0;
    }
    acc[category] += Math.abs(parseFloat(exp.spent_amount?.amount || 0));
    return acc;
  }, {});
  
  // Sort categories by spend
  const topCategories = Object.entries(categorized)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalAmount > 0 ? (amount / totalAmount * 100).toFixed(1) : '0.0'
    }));
  
  // Determine currency from expenses
  const currency = validExpenses.length > 0 
    ? (validExpenses[0].spent_amount?.currency || 'AUD')
    : 'AUD';
  
  // Calculate how much to spend to reach target average (default: $150/day)
  const calculateTargetSpend = (targetDailyRate = 150) => {
    // Calculate total target amount for the period
    const targetTotalForPeriod = targetDailyRate * daysDiff;
    // Calculate how much more needed to reach target
    const additionalAmountNeeded = targetTotalForPeriod - totalAmount;
    // If already over target, return 0
    return Math.max(0, additionalAmountNeeded);
  };

  return {
    dailyRate,
    totalAmount,
    movingAverage7Day,
    movingAverage30Day,
    periodDays: daysDiff,
    topCategories,
    currency,
    targetSpendAmount: calculateTargetSpend(),
    // Return updated data for storage
    historicalData: {
      expenses: allExpenses,
      dailyRates: updatedDailyRates
    }
  };
}

/**
 * Calculate moving average over specified days
 * 
 * @param {Object} dailyRates - Daily expense totals
 * @param {number} days - Number of days for moving average
 * @returns {number} - Moving average
 */
function calculateMovingAverage(dailyRates, days) {
  const dates = Object.keys(dailyRates).sort();
  if (dates.length === 0) return 0;
  
  // Get the last 'days' dates
  const recentDates = dates.slice(-days);
  
  // Calculate sum for those days
  const sum = recentDates.reduce((total, date) => {
    return total + (dailyRates[date] || 0);
  }, 0);
  
  // Return average
  return sum / recentDates.length;
}