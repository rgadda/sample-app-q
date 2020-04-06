
// example of cron
// var job = new CronJob('10 * * * * *', function () {
//     console.log('You will see this message every 10 seconds');
// }, null, true, 'America/Los_Angeles');
// job.start();

/*
*********
https://crontab.guru/#0_7_*_*_*
*********
30 * * * *	Execute a command at 30 minutes past the hour, every hour.
0 13 * * 1	Execute a command at 1:00 p.m. UTC every Monday.
*\/5 * * * *	Execute a command every five minutes.
0 *\/2 * * *	Execute a command every second hour, on the hour. 


{  
    name: "Implementing Strategy 1",
    message: { "taskName": "strategy 1", "queue": "worker-queue" },  // message in json format
    cronTime: "*\/15 * * * * ",
repeat: 1
},
{
    name: "Implementing Strategy 2",
        message: { "taskName": "strategy 2", "queue": "worker-queue" },  // message in json format
    cronTime: "0 7 * * *",
        repeat: 1
},

    {
        name: "Measure Performance",
        message: { "taskName": "short term - measure performance", "queue": "worker-queue" },  // message in json format
        cronTime: "2 10-17 * * *",
        repeat: 1
    }

*/

const jobs = [
    {
        name: "Implementing Short Term Strategy",
        message: { "taskName": "short term", "queue": "worker-queue" },  // message in json format
        cronTime: "*/1 9-17 * * *",
        repeat: 1
    }
];

module.exports = {
    jobs: jobs
}