const _ = require("lodash")
const config = require("../config")
const Alpaca = require('@alpacahq/alpaca-trade-api');
const helperFunctions = require('../helperFunctions/function');
const moment = require("moment")
const TI = require('technicalindicators');

// alpaca trade api connector
const alpaca = new Alpaca({
    keyId: process.env.ALPACA_KEY,
    secretKey: process.env.ALPACA_SECRET,
    paper: config.PAPER
});

const getIchimokuSignals = (input) => {
    const ichimoku = new TI.IchimokuCloud({
        ...input, conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26
    }).getResult();
    if (_.isEmpty(ichimoku)) {
        return 'wait';
    }
    // console.log(ichimoku[ichimoku.length - 1], input.close[input.close.length - 1])
    const price = input.close[input.close.length - 1];
    const prevPrice = input.close[input.close.length - 2];
    const latestIchimokuValues = ichimoku[ichimoku.length - 1];
    const previousIchimokuValues = ichimoku[ichimoku.length - 2];

    // latest constants
    const isPriceAboveKumoCloud = price > latestIchimokuValues.spanA && price > latestIchimokuValues.spanB;
    const isPriceBelowKumoCloud = price < latestIchimokuValues.spanA && price < latestIchimokuValues.spanB;
    // const isPriceAboveConversionLine = price > latestIchimokuValues.conversion;
    // const isPriceAboveBaseLine = price > latestIchimokuValues.base;
    // const isConversionsAboveBase = latestIchimokuValues.conversion > latestIchimokuValues.base;
    // const isConversionsBelowBase = latestIchimokuValues.conversion < latestIchimokuValues.base;


    // previous constants
    // const isPrevPriceAboveKumoCloud = prevPrice > previousIchimokuValues.spanA && prevPrice > previousIchimokuValues.spanB;
    // const isPrevPriceAboveConversionLine = prevPrice > previousIchimokuValues.conversion;
    // const isPrevPriceAboveBaseLine = prevPrice > previousIchimokuValues.base;
    // const isPrevPriceBelowBaseLine = prevPrice < previousIchimokuValues.base;
    // const isPrevConversionsAboveBase = previousIchimokuValues.conversion > previousIchimokuValues.base;
    // const isPrevConversionsBelowBase = previousIchimokuValues.conversion < previousIchimokuValues.base;

    const isPriceCrossingAboveBaseLine = price > latestIchimokuValues.base && prevPrice < previousIchimokuValues.base;
    const isPriceCrossingBelowBaseLine = price < latestIchimokuValues.base && prevPrice > previousIchimokuValues.base;
    console.log(`price: ${price}, latestIchimokuValues.base: ${latestIchimokuValues.base}, previousIchimokuValues.base: ${previousIchimokuValues.base}
                    isPriceCrossingAboveBaseLine: ${isPriceCrossingAboveBaseLine}
                    isPriceAboveKumoCloud: ${isPriceAboveKumoCloud}
                    isPriceCrossingBelowBaseLine: ${isPriceCrossingBelowBaseLine}
                    isPriceBelowKumoCloud: ${isPriceBelowKumoCloud}`)
    if (isPriceCrossingAboveBaseLine && isPriceAboveKumoCloud) {
        return 'golong';
    }


    if (isPriceCrossingBelowBaseLine && isPriceBelowKumoCloud) {
        return 'goshort';
    }
    return 'wait';
}

const buySellSignal = (data) => {
    const input = _.reduce(data, (acc, candle) => {
        return {
            open: [...acc.open, candle.o],
            close: [...acc.close, candle.c],
            low: [...acc.low, candle.l],
            high: [...acc.high, candle.h],
            volume: [...acc.volume, candle.v],
            timestamp: [...acc.timestamp, candle.t]
        }
    }, {
        open: [],
        close: [],
        low: [],
        high: [],
        volume: [],
        timestamp: []
    });

    return getIchimokuSignals(input);

    // const macd = new TI.MACD({
    //     values: input.close,
    //     fastPeriod: 36,
    //     slowPeriod: 78,
    //     signalPeriod: 27
    // }).getResult()
    // const heiknashi = new TI.heikinashi(input)
    // const mfi = new TI.MFI({ ...heiknashi, period: 42 }).getResult();
    // const cci = new TI.CCI({ ...heiknashi, period: 60 }).getResult();





    // const currentDataSet = macd[macd.length - 1];
    // const previousDataSet = macd[macd.length - 2];

    // if (currentDataSet.signal > 0.2 && currentDataSet.histogram < previousDataSet.histogram && mfi[mfi.length - 1] > 60 && cci[cci.length - 1] > 50) {
    //     console.log(`currentDataSet.signal > 0.2: ${currentDataSet.signal} > 0.2 && 
    //     currentDataSet.histogram < previousDataSet.histogram: ${currentDataSet.histogram} < ${previousDataSet.histogram}&& 
    //     mfi[mfi.length - 1] > 60: ${mfi[mfi.length - 1]} > 60 && 
    //     cci[cci.length - 1] > 50: ${cci[cci.length - 1]} > 50
    //     #####
    //     Hence go short
    //     #####`);
    //     return 'goshort'
    // }

    // if (currentDataSet.signal < -0.2 && currentDataSet.histogram > previousDataSet.histogram && mfi[mfi.length - 1] < 40 && cci[cci.length - 1] < -50) {
    //     console.log(`currentDataSet.signal < -0.2: ${currentDataSet.signal} < -0.2 && 
    //     currentDataSet.histogram > previousDataSet.histogram: ${currentDataSet.histogram} > ${previousDataSet.histogram}&& 
    //     mfi[mfi.length - 1] < 40: ${mfi[mfi.length - 1]} < 40 && 
    //     cci[cci.length - 1] < -50: ${cci[cci.length - 1]} < -50
    //     #####
    //     Hence go long
    //     #####`);
    //     return 'golong'
    // }
    // return 'wait'
}

async function actOnSignal(signal, symbol, qty, price, target, side = false) {
    console.log(`Line 57: Signal for ${symbol}: ${signal}`)
    switch (signal) {
        case "goshort":
            if (side !== "short") {
                console.log(`Line 66(${symbol}): close 1, ${side}, ${signal}`)
                await alpaca.closePosition(symbol)
                    .then(async (resp) => {
                        console.log(`Closed your ${side} position in ${symbol}`);
                        console.log('placing short order');
                        setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "sell", price, target, true); }, 500);
                    }).catch(async (err) => {
                        await helperFunctions.submitOrder(qty, symbol, "sell", price, target);
                    });
            } else {
                !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            }
            // await helperFunctions.submitOrder(qty, symbol, "sell", price, target);
            break;
        case "golong":
            if (side !== "long") {
                console.log(`Line 81(${symbol}): close 2, ${side}, ${signal}`)
                await alpaca.closePosition(symbol).then(async (resp) => {
                    console.log(`Closed your ${side} position in ${symbol}`);
                    console.log(`placing long order`);
                    setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "buy", price, target, true); }, 500);
                }).catch(async (err) => {
                    await helperFunctions.submitOrder(qty, symbol, "buy", price, target);
                });
            } else {
                !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            }
            // helperFunctions.submitOrder(qty, symbol, "buy", price, target);
            break;

        case "closelong":
        case "closeshort":
            console.log(`Line 96(${symbol}): close 3, ${side}, ${signal}`)
            await alpaca.closePosition(symbol).then(async (resp) => {
                console.log(`Closed your ${side} position in ${symbol}`);
            }).catch(async (err) => {
                console.log(`No position to close ${side} in ${symbol}`)
            });
            break;
        default:
            !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
    }
}

const run = async (skipClosing = false) => {
    const beginningTime = moment('9:40am', 'h:mma');
    const stopTrading = moment('3:50pm', 'h:mma');
    const endTime = moment('3:55pm', 'h:mma');
    if (!skipClosing && (moment().isBefore(beginningTime) || moment().isAfter(stopTrading))) {
        console.log(`market closed`)
        return;
    }
    if (!skipClosing && moment().isBefore(endTime) && moment().isAfter(stopTrading)) {
        alpaca.closeAllPositions().catch(err => {
            console.log(err)
        })
    }
    // const account = await alpaca.getAccount()
    // console.log(`Account: ${account.cash} and ${account.portfolio_value}`)
    // const openOrders = await alpaca.getOrders({ status: 'open' });
    _.forEach(_.keys(config.tradeableAssets), async (symbol) => {
        let dataset = await helperFunctions.getData(symbol, config.tradeableAssets[symbol].minutes);
        if (!dataset.results.length || (parseInt(dataset.results[dataset.results.length - 1].diff) > config.tradeableAssets[symbol].minutes + 1)) {
            console.log(`No data for ${symbol}`)
            return;
        }
        const qty = config.tradeableAssets[symbol].qty;
        const signal = buySellSignal(dataset.results);
        const price = dataset.results[dataset.results.length - 1].c
        console.log(`****** Signal: ${signal}`);
        alpaca.getPosition(symbol).then(async (position) => {
            await actOnSignal(signal, symbol, qty, price, config.tradeableAssets[symbol].target, position.side);
        }).catch(async (err) => {
            console.log(`err: ${err.error.message} and signal: ${signal}`)
            if (signal !== "wait") {
                await actOnSignal(signal, symbol, qty, price, config.tradeableAssets[symbol].target);
            }
        })
    })
}


const test = async function () {
    // let data = await helperFunctions.getData(['AAPL'], '15Min', 25);
    const openOrders = await alpaca.getOrders({ status: 'open' });
    console.log(openOrders)
    const fil = _.filter(openOrders, (order) => order.symbol === 'TSLA')
    // const account = await alpaca.getAccount();

}

module.exports = {
    test: test,
    run: run
}
// run(true)
// test()