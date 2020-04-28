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
    const macd = new TI.MACD({
        values: input.close,
        fastPeriod: 36,
        slowPeriod: 78,
        signalPeriod: 27
    }).getResult()
    const heiknashi = new TI.heikinashi(input)
    const mfi = new TI.MFI({ ...heiknashi, period: 42 }).getResult();
    const cci = new TI.CCI({ ...heiknashi, period: 60 }).getResult();


    const currentDataSet = macd[macd.length - 1];
    const previousDataSet = macd[macd.length - 2];

    if (currentDataSet.signal > 0.2 && currentDataSet.histogram < previousDataSet.histogram && mfi[mfi.length - 1] > 60 && cci[cci.length - 1] > 50) {
        console.log(`currentDataSet.signal > 0.2: ${currentDataSet.signal} > 0.2 && 
        currentDataSet.histogram < previousDataSet.histogram: ${currentDataSet.histogram} < ${previousDataSet.histogram}&& 
        mfi[mfi.length - 1] > 60: ${mfi[mfi.length - 1]} > 60 && 
        cci[cci.length - 1] > 50: ${cci[cci.length - 1]} > 50
        #####
        Hence go short
        #####`);
        return 'goshort'
    }

    if (currentDataSet.signal < -0.2 && currentDataSet.histogram > previousDataSet.histogram && mfi[mfi.length - 1] < 40 && cci[cci.length - 1] < -50) {
        console.log(`currentDataSet.signal < -0.2: ${currentDataSet.signal} < -0.2 && 
        currentDataSet.histogram > previousDataSet.histogram: ${currentDataSet.histogram} > ${previousDataSet.histogram}&& 
        mfi[mfi.length - 1] < 40: ${mfi[mfi.length - 1]} < 40 && 
        cci[cci.length - 1] < -50: ${cci[cci.length - 1]} < -50
        #####
        Hence go long
        #####`);
        return 'golong'
    }
    return 'wait'
}

async function actOnSignal(signal, symbol, qty, price, target, side = false) {
    console.log(`Line 57: Signal for ${symbol}: ${signal}`)
    switch (signal) {
        case "goshort":
            // if (side !== "short") {
            //     console.log(`Line 66(${symbol}): close 1, ${side}, ${signal}`)
            //     await alpaca.closePosition(symbol)
            //         .then(async (resp) => {
            //             console.log(`Closed your ${side} position in ${symbol}`);
            //             console.log('placing short order');
            //             setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "sell", price, target, true); }, 500);
            //         }).catch(async (err) => {
            //             await helperFunctions.submitOrder(qty, symbol, "sell", price, target);
            //         });
            // } else {
            //     !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            // } 
            await helperFunctions.submitOrder(qty, symbol, "sell", price, target);
            break;
        case "golong":
            // if (side !== "long") {
            //     console.log(`Line 81(${symbol}): close 2, ${side}, ${signal}`)
            //     await alpaca.closePosition(symbol).then(async (resp) => {
            //         console.log(`Closed your ${side} position in ${symbol}`);
            //         console.log(`placing long order`);
            //         setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "buy", price, target, true); }, 500);
            //     }).catch(async (err) => {
            //         await helperFunctions.submitOrder(qty, symbol, "buy", price, target);
            //     });
            // } else {
            //     !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            // }
            helperFunctions.submitOrder(qty, symbol, "buy", price, target);
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
        // if (parseInt(dataset.results[dataset.results.length - 1].diff) > config.tradeableAssets[symbol].minutes + 1) {
        //     console.log(`No data for ${symbol}`)
        //     return;
        // }
        const qty = config.tradeableAssets[symbol].qty;
        const signal = buySellSignal(dataset.results);
        const price = dataset.results[dataset.results.length - 1].c
        console.log(`****** Signal: ${signal}`);
        if (signal === "wait") {
            return;
        } else {
            await actOnSignal(signal, symbol, qty, price, config.tradeableAssets[symbol].target);
        }
        // alpaca.getPosition(symbol).then(async (position) => {
        //     if (Number(position.unrealized_pl) >= parseInt(config.tradeableAssets[symbol].target * config.tradeableAssets[symbol].qty)) {
        //         console.log(`Line 133(${symbol}): close 4, ${position.side}, ${signal}`)
        //         console.log("closing position as target hit", position.unrealized_pl)
        //         return alpaca.closePosition(position.symbol)
        //     }
        //     console.log(`Line 139(${symbol}): act 1, ${signal}`)
        //     await actOnSignal(signal, symbol, qty, price, config.tradeableAssets[symbol].target, position.side);
        // }).catch(async (err) => {
        //     console.log(err.error)
        //     console.log(`Line 143(${symbol}): act 2, ${signal}`)
        //     if (signal !== "wait") {
        //         await actOnSignal(signal, symbol, qty, price, config.tradeableAssets[symbol].target);
        //     }
        // })
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
run(true)
// test()