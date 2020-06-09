const _ = require("lodash");
const config = require("../config");
const Alpaca = require("@alpacahq/alpaca-trade-api");
const helperFunctions = require("../helperFunctions/function");
const moment = require("moment");
const TI = require("technicalindicators");

// alpaca trade api connector
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_KEY,
  secretKey: process.env.ALPACA_SECRET,
  paper: config.PAPER
});

const getIchimokuSignals = input => {
  const ichimoku = new TI.IchimokuCloud({
    ...input,
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52,
    displacement: 26
  }).getResult();
  if (_.isEmpty(ichimoku)) {
    return "wait";
  }
  const price = input.close[input.close.length - 1];
  const isPriceBelowLaggingSpan = price < input.close[input.close.length - 26];
  const isPriceAboveLaggingSpan = price > input.close[input.close.length - 26];

  const prevPrice = input.close[input.close.length - 2];
  const latestIchimokuValues = {
    conversion: _.round(ichimoku[ichimoku.length - 1].conversion, 3),
    base: _.round(ichimoku[ichimoku.length - 1].base, 3),
    spanA: _.round(ichimoku[ichimoku.length - 1].spanA, 3),
    spanB: _.round(ichimoku[ichimoku.length - 1].spanB, 3)
  };
  const previousIchimokuValues = {
    conversion: _.round(ichimoku[ichimoku.length - 2].conversion, 3),
    base: _.round(ichimoku[ichimoku.length - 2].base, 3),
    spanA: _.round(ichimoku[ichimoku.length - 2].spanA, 3),
    spanB: _.round(ichimoku[ichimoku.length - 2].spanB, 3)
  };

  // latest constants
  const isPriceAboveKumoCloud =
    price > latestIchimokuValues.spanA && price > latestIchimokuValues.spanB;

  const isPriceBelowKumoCloud =
    price < latestIchimokuValues.spanA && price < latestIchimokuValues.spanB;

  const isBaseAboveKumoCloud =
    latestIchimokuValues.base > latestIchimokuValues.spanA &&
    latestIchimokuValues.base > latestIchimokuValues.spanB;

  const isBaseBelowKumoCloud =
    latestIchimokuValues.base < latestIchimokuValues.spanA &&
    latestIchimokuValues.base < latestIchimokuValues.spanB;

  const isPriceCrossingAboveBaseLine =
    price > latestIchimokuValues.base &&
    prevPrice < previousIchimokuValues.base;

  const isPriceCrossingBelowBaseLine =
    price < latestIchimokuValues.base &&
    prevPrice > previousIchimokuValues.base;

  // console.log(
  //   `Kumo Cloud: ${latestIchimokuValues.spanA} - ${latestIchimokuValues.spanB}`
  // );
  // console.log(`Price: ${price}`);
  // console.log(`Base: ${latestIchimokuValues.base}`);
  // console.log(`isPriceAboveLaggingSpan: ${isPriceAboveLaggingSpan}`);
  if (
    isPriceAboveLaggingSpan &&
    isBaseAboveKumoCloud &&
    isPriceAboveKumoCloud &&
    isPriceCrossingAboveBaseLine
  ) {
    return "golong";
  }

  if (
    isPriceBelowLaggingSpan &&
    isBaseBelowKumoCloud &&
    isPriceCrossingBelowBaseLine &&
    isPriceBelowKumoCloud
  ) {
    return "goshort";
  }
  return "wait";
};

const buySellSignal = data => {
  const input = _.reduce(
    data,
    (acc, candle) => {
      return {
        open: [...acc.open, candle.o],
        close: [...acc.close, candle.c],
        low: [...acc.low, candle.l],
        high: [...acc.high, candle.h],
        volume: [...acc.volume, candle.v],
        timestamp: [...acc.timestamp, candle.t]
      };
    },
    {
      open: [],
      close: [],
      low: [],
      high: [],
      volume: [],
      timestamp: []
    }
  );

  return getIchimokuSignals(input);
};

async function actOnSignal(signal, symbol, qty, price, target, side = false) {
  switch (signal) {
    case "goshort":
      helperFunctions.submitOrder(qty, symbol, "sell", price, target, true);
      break;
    case "golong":
      helperFunctions.submitOrder(qty, symbol, "buy", price, target, true);
      // helperFunctions.submitOrder(qty, symbol, "buy", price, target);
      break;
    default:
      !side
        ? console.log(`Wait for the right trade in ${symbol}`)
        : console.log(`Hold your ${side} position in ${symbol}`);
  }
}

const run = async (tradeableAssets, skipClosing = false) => {
  const beginningTime = moment("9:35am", "h:mma");
  const stopTrading = moment("3:55pm", "h:mma");
  const endTime = moment("4:00pm", "h:mma");
  if (moment().isBefore(endTime) && moment().isAfter(stopTrading)) {
    alpaca.cancelAllOrders().then(() =>
      alpaca.closeAllPositions().then(resp => {
        console.log(resp);
      })
    );
  }
  if (
    !skipClosing &&
    (moment().isBefore(beginningTime) || moment().isAfter(stopTrading))
  ) {
    console.log(`market closed`);
    return;
  }

  // const account = await alpaca.getAccount()
  // console.log(`Account: ${account.cash} and ${account.portfolio_value}`)
  // const openOrders = await alpaca.getOrders({ status: 'open' });
  _.forEach(_.keys(tradeableAssets), async symbol => {
    let dataset = await helperFunctions.getData(
      symbol,
      tradeableAssets[symbol].minutes
    );
    if (
      !dataset.results.length ||
      parseInt(dataset.results[dataset.results.length - 1].diff) >
        tradeableAssets[symbol].minutes + 1
    ) {
      console.log(`No data for ${symbol}`);
      return;
    }
    const qty = tradeableAssets[symbol].qty;
    const signal = buySellSignal(dataset.results);
    const price = dataset.results[dataset.results.length - 1].c;
    console.log(`****** Symbol: ${symbol}, Signal: ${signal}`);
    alpaca
      .getPosition(symbol)
      .then(() => {
        console.log(`Hold your position: ${symbol} - ${signal}`);
      })
      .catch(async err => {
        if (signal !== "wait") {
          await actOnSignal(
            signal,
            symbol,
            qty,
            price,
            tradeableAssets[symbol].target
          );
        }
      });
  });
};

const test = async function() {
  const stopTrading = moment("3:55pm", "h:mma");
  const endTime = moment("4:00pm", "h:mma");
  if (moment().isBefore(endTime) && moment().isAfter(stopTrading)) {
    console.log("I am here");
    alpaca.closeAllPositions().then(resp => {
      console.log(resp);
    });
  }
  alpaca.cancelAllOrders();
};

module.exports = {
  test: test,
  run: run
};

// test();
// execute short term
// run(config.shortTerm, true);

// execute mid term
// run(config.midTerm, true);
