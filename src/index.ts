import { FunctionArgs, output, scheduleEmail } from "exchange-outpost-abi";

function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i <= prices.length - period; i++) {
    const sum = prices.slice(i, i + period).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function run() {
  const args = FunctionArgs.get();

  try {
    // Get parameters
    const email = args.getCallArgument('email', (v: string) => v);
    const fastPeriod = args.getCallArgument('fast_period', parseInt) || 10;
    const slowPeriod = args.getCallArgument('slow_period', parseInt) || 20;

    // Validate email
    if (!email) {
      output({ status: 'error', message: 'Email address is required' });
      return;
    }

    // Validate periods
    if (fastPeriod >= slowPeriod) {
      output({ status: 'error', message: 'Fast period must be less than slow period' });
      return;
    }

    // Get candles
    const ticker = args.getTicker("pegged_data");
    const candles = ticker.getCandles();
    if (!candles || candles.length < slowPeriod) {
      output({ status: 'error', message: `Not enough candles. Need at least ${slowPeriod}` });
      return;
    }

    // Extract close prices
    const closePrices = candles.map(c => c.close);

    // Calculate SMAs
    const fastSMA = calculateSMA(closePrices, fastPeriod);
    const slowSMA = calculateSMA(closePrices, slowPeriod);

    // Check for crossover (need at least 2 values to detect)
    if (fastSMA.length < 2 || slowSMA.length < 2) {
      output({ status: 'error', message: 'Not enough data to detect crossover' });
      return;
    }

    // Get the latest and previous values (aligned indices)
    const latestFast = fastSMA[fastSMA.length - 1];
    const previousFast = fastSMA[fastSMA.length - 2];
    const latestSlow = slowSMA[slowSMA.length - 1];
    const previousSlow = slowSMA[slowSMA.length - 2];

    // Detect crossover
    let crossover: 'bullish' | 'bearish' | null = null;
    
    if (previousFast <= previousSlow && latestFast > latestSlow) {
      crossover = 'bullish'; // Fast crossed above slow
    } else if (previousFast >= previousSlow && latestFast < latestSlow) {
      crossover = 'bearish'; // Fast crossed below slow
    }

    // Send alert if crossover detected
    if (crossover) {
      const message = `${ticker.symbol} Moving Average Crossover Alert!\n\n` +
        `Type: ${crossover.toUpperCase()}\n` +
        `Fast MA (${fastPeriod}): ${latestFast.toFixed(2)}\n` +
        `Slow MA (${slowPeriod}): ${latestSlow.toFixed(2)}\n` +
        `Current Price: ${closePrices[closePrices.length - 1].toFixed(2)}`;
      
      scheduleEmail(email, message);
      
      output({
        status: 'alert_sent',
        crossover: crossover,
        symbol: ticker.symbol,
        fast_ma: latestFast,
        slow_ma: latestSlow,
        current_price: closePrices[closePrices.length - 1]
      });
    } else {
      output({
        status: 'no_crossover',
        symbol: ticker.symbol,
        fast_ma: latestFast,
        slow_ma: latestSlow,
        current_price: closePrices[closePrices.length - 1]
      });
    }
  } catch (error) {
    output({ status: 'error', message: String(error) });
  }
}

module.exports = { run };