const config = require("./config")
const fetch = require('node-fetch');
const moment = require("moment");
const EMA = require('technicalindicators').EMA;
const _ = require("lodash")
const TI = require('technicalindicators');


const getMinuteData = (symbol, interval) => {
    const today = moment().subtract(1, 'day').format('YYYY-MM-DD');
    const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
    return fetch(`${config.polygon.apiUrl}/v2/aggs/ticker/${symbol}/range/${interval}/minute/${today}/${tomorrow}?unadjusted=true&apiKey=${config.polygon.key}&limit=45`)
        .then(async res => {
            const jsonObj = await res.json();
            if (!jsonObj.results) {
                return {}
            }
            return jsonObj
        })
        .catch(err => {
            if (typeof err.text === 'function') {
                err.text().then(errorMessage => {
                    // this.props.dispatch(displayTheError(errorMessage))
                    console.log(`error: ${errorMessage}`)
                });
            } else {
                console.log(`err: ${err}`)
            }
        });
}

const test = async () => {
    const data = await getMinuteData('AAPL', 5);
    console.time()
    const heikinashiInput = _.reduce(data.results, (acc, candle) => {
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
    })

    const HA = new TI.HeikinAshi(heikinashiInput)

    console.log(HA.getResult().close.length);
    const openEMA = TI.EMA.calculate({ period: 5, values: HA.getResult().close });
    console.timeEnd()
    console.log(openEMA.length)
}


module.exports = {
    getMinuteData: getMinuteData
}

// test()
// let period = 5;
// let values = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// console.log(EMA.calculate({ period: period, values: values }))