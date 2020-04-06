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
            timestamp: [...acc.timestamp, candle.t],
            period: acc.period
        }
    }, {
        open: [],
        close: [],
        low: [],
        high: [],
        volume: [],
        timestamp: []
    });
    const HA = new TI.HeikinAshi(input)
    const macd = new TI.MACD({
        values: HA.getResult().close,
        fastPeriod: 36,
        slowPeriod: 72,
        signalPeriod: 27,
        SimpleMAOscillator: true,
        SimpleMASignal: true
    }).getResult()

    const histogram1 = macd[macd.length - 1].histogram;
    const histogram2 = macd[macd.length - 2].histogram;
    console.log(histogram1, histogram2)
    if (histogram1 > 0 && histogram2 < 0) {
        return 'golong'
    }
    if (histogram1 < 0 && histogram2 > 0) {
        return 'goshort'
    }
    return 'wait'
}

async function actOnSignal(signal, symbol, qty, side = false) {
    // console.log(`Signal for ${symbol}: ${signal}`)
    switch (signal) {
        case "goshort":
            if (side !== "short") {
                await alpaca.closePosition(symbol)
                    .then(async (resp) => {
                        console.log(`Closed your ${side} position in ${symbol}`);
                        console.log('placing short order');
                        setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "sell", true); }, 500);
                    }).catch(async (err) => {
                        await helperFunctions.submitOrder(qty, symbol, "sell");
                    });
            } else {
                !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            }
            break;
        case "golong":
            if (side !== "long") {
                await alpaca.closePosition(symbol).then(async (resp) => {
                    console.log(`Closed your ${side} position in ${symbol}`);
                    console.log(`placing long order`);
                    setTimeout(() => { helperFunctions.submitOrder(qty, symbol, "buy", true); }, 500);
                }).catch(async (err) => {
                    await helperFunctions.submitOrder(qty, symbol, "buy");
                });
            } else {
                !side ? console.log(`Wait for the right trade in ${symbol}`) : console.log(`Hold your ${side} position in ${symbol}`);
            }
            break;

        case "closelong":
        case "closeshort":
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
    const endTime = moment('3:45pm', 'h:mma');
    if (!skipClosing && (moment().isBefore(beginningTime) || moment().isAfter(stopTrading))) {
        console.log(`market closed`)
        return;
    }
    if (!skipClosing && (moment().isBefore(endTime) || moment().isAfter(stopTrading))) {
        alpaca.closeAllPositions().catch(err => {
            console.log(err)
        })
    }
    const account = await alpaca.getAccount()
    console.log(`Account: ${account.cash} and ${account.portfolio_value}`)
    _.forEach(_.keys(config.tradeableAssets), async (symbol) => {
        let dataset = await helperFunctions.getData(symbol, config.tradeableAssets[symbol].minutes);
        if (dataset.results.length < 10 || parseInt(dataset.results[dataset.results.length - 1].diff) > config.tradeableAssets[symbol].minutes + 1) {
            console.log(`No data for ${symbol}`)
            return;
        }
        const qty = config.tradeableAssets[symbol].qty;
        // console.log(`Data.lenght: ${ dataset.results.length } `)
        const signal = buySellSignal(dataset.results);
        console.log(`****** Signal: ${signal}`)
        alpaca.getPosition(symbol).then(async (position) => {
            console.log(`Gain/Loss in ${symbol}:`, position.unrealized_pl)
            if (Number(position.unrealized_pl) >= parseInt(config.tradeableAssets[symbol].target * config.tradeableAssets[symbol].qty)) {
                console.log("closing position as target hit", position.unrealized_pl)
                return alpaca.closePosition(position.symbol)
            }
            await actOnSignal(signal, symbol, qty, position.side);
        }).catch(async (err) => {
            // return if data older than 15 mins
            await actOnSignal(signal, symbol, qty);
        })
    })
}


const test = async function () {
    // let data = await helperFunctions.getData(['AAPL'], '15Min', 25);
    const account = await alpaca.getAccount();
    // const account = await alpaca.getAccount();

}

module.exports = {
    test: test,
    run: run
}
// run(true)