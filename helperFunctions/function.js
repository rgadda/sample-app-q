const _ = require("lodash")
const config = require("../config")
const polygon = require("../polygon")

const Alpaca = require('@alpacahq/alpaca-trade-api');
const alpaca = new Alpaca({
    keyId: process.env.ALPACA_KEY,
    secretKey: process.env.ALPACA_SECRET,
    paper: config.PAPER
});
// Add time diff between last candle and current epoch time
const addTimeDiff = (data) => {
    let transformedData = { ...data, results: [] };
    _.map(data.results, (v, k) => {
        var r = {
            ...v,
            diff: (Date.now() - new Date(parseInt(v.t))) / (1000 * 60),
        }

        transformedData.results[k] = r;
    });
    return transformedData
}

const createOrder = async ({ stock, quantity, side, price, target }) => {
    console.log(price, target, {
        symbol: stock,
        qty: quantity,
        side: side,
        type: "market",
        time_in_force: "day",
        order_class: "bracket",
        take_profit: {
            limit_price: side === "buy" ? parseFloat(price + target) : parseFloat(price - target)
        },
        stop_loss: {
            stop_price: side === "buy" ? parseFloat(price - target) : parseFloat(price + target),
            limit_price: side === "buy" ? parseFloat(price - (target * 2)) : parseFloat(price + (target * 2))
        }
    })
    await alpaca.createOrder({
        symbol: stock,
        qty: quantity,
        side: side,
        type: "market",
        time_in_force: "day",
        order_class: "bracket",
        take_profit: {
            limit_price: side === "buy" ? parseFloat(price + target) : parseFloat(price - target)
        },
        stop_loss: {
            stop_price: side === "buy" ? parseFloat(price - target) : parseFloat(price + target),
            limit_price: side === "buy" ? parseFloat(price - (target * 2)) : parseFloat(price + (target * 2))
        }
    }).then(() => {
        console.log(`###################################`)
        console.log("Market order of | " + quantity + " " + stock + " " + side + " | completed.");
        console.log(`###################################`)
    }).catch(async (err) => {
        console.log(`xxxxxxxxxxxxxxxxxxxxxxx`)
        console.log("Order of | " + quantity + " " + stock + " " + side + " | did not go through: ", err.response.body.message);
        console.log(`xxxxxxxxxxxxxxxxxxxxxxx`)
        alpaca.getOrders({ symbol: stock }).then(resp => {
            console.log(`-----getOrder resp: ${resp}`)
        })
        await cancelAllOrders()
        // await alpaca.closePosition(stock)
        await setTimeout(() => { submitOrder(quantity, stock, side, true) }, 10000)
    });
}

/**
 * Submit order to alpaca for execution
 * @param {int} quantity 
 * @param {string} stock 
 * @param {string} side 
 */
const submitOrder = async (quantity, stock, side, price, target, backToBack = false, attempt = 1) => {
    var prom = new Promise(async (resolve, reject) => {
        if (quantity > 0) {
            if (backToBack) {
                console.log(`-------- Executing backToBack Order ${stock}: ${attempt}---------`)
                await alpaca.getPosition(stock).then((position) => {
                    if (side !== position.side) {
                        console.log("Position still open")
                        setTimeout(() => { submitOrder(quantity, stock, side, price, target, backToBack, ++attempt) }, 500)
                    }
                }).catch(async (err) => {
                    await createOrder({ stock, quantity, side, price, target });
                })
            } else {
                await createOrder({ stock, quantity, side, price, target });
            }

        }
        else {
            console.log("Quantity is <=0, order of | " + quantity + " " + stock + " " + side + " | not sent.");
            resolve(true);
        }
    });
    return prom;
}

// Cancel all existing order
const cancelAllOrders = async () => {
    let orders;
    await alpaca.getOrders({
        status: 'open',
        direction: 'desc'
    }).then((resp) => {
        orders = resp;
    }).catch((err) => { console.log(err.error); });
    let promOrders = [];
    _.forEach(orders, (order) => {
        promOrders.push(new Promise(async (resolve, reject) => {
            await alpaca.cancelOrder(order.id).catch((err) => { console.log(err.error); });
            resolve();
        }));
    });
    await Promise.all(promOrders);
}

const awaitMarketOpen = () => {
    var prom = new Promise(async (resolve, reject) => {
        var isOpen = false;
        await alpaca.getClock().then(async (resp) => {
            if (resp.is_open) {
                // wait for 10 mins before collecting data
                console.log("Waiting for 10 mins before starting to trade")
                // setTimeout(() => resolve(), 60000 * 10);
                resolve()
            }
            else {

                alpaca.getClock().then((resp) => {
                    isOpen = resp.is_open;
                    if (isOpen) {

                        resolve();
                    }
                    else {
                        var openTime = new Date(resp.next_open.substring(0, resp.next_close.length - 6));
                        var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
                        var timeToCloseInHours = _.floor((openTime - currTime) / 1000 / 60 / 60, 2);
                        var timeToCloseInMins = _.floor((openTime - currTime) / 1000 / 60);
                        if (timeToCloseInHours > 0) {
                            console.log(timeToCloseInHours + " hours til next market open.")
                        } else {
                            console.log(timeToCloseInMins + " mins til next market open.")
                        }

                    }
                }).catch((err) => { console.log(err.error); });

            }
        });
    });
    return prom;
}

const closeAllPositions = async () => {
    await alpaca.getPositions().then(async (resp) => {
        var promClose = [];
        const pos = _.filter(resp, (p) => !_.includes(config.strategy.longTerm.symbol, p.symbol))
        pos.forEach((position) => {
            promClose.push(new Promise(async (resolve, reject) => {
                var orderSide;
                if (position.side == 'long') orderSide = 'sell';
                else orderSide = 'buy';
                var quantity = Math.abs(position.qty);
                await submitOrder(quantity, position.symbol, orderSide);
                resolve();
            }));
        });

        await Promise.all(promClose);
    }).catch((err) => { console.log(err.error); });
}

// get data for array of symbols
const getData = async (symbol, interval = 5) => {
    const data = await polygon.getMinuteData(symbol, interval);
    if (_.isEmpty(data)) {
        return { ...data, results: [] }
    }
    return addTimeDiff(data);
}

// Figure out when the market will close so we can prepare to sell beforehand.
const getClosingTime = async () => {
    let timeToClose;
    await alpaca.getClock().then((resp) => {
        var closingTime = new Date(resp.next_close.substring(0, resp.next_close.length - 6));
        var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
        timeToClose = Math.abs(closingTime - currTime);
    }).catch((err) => { console.log(err.error); });
    return timeToClose;
}

module.exports = {
    addTimeDiff: addTimeDiff,
    submitOrder: submitOrder,
    cancelAllOrders: cancelAllOrders,
    awaitMarketOpen: awaitMarketOpen,
    closeAllPositions: closeAllPositions,
    getData: getData,
    getClosingTime: getClosingTime,
}