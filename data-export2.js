/** Extract the time spent on each page */
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const Script = require('./models/Script.js');
const User = require('./models/User.js');
const mongoose = require('mongoose');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Console.log color shortcuts
const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

/**
 * Connect to MongoDB.
 */
const mongoUri = process.env.MONGOLAB_URI || process.env.MONGODB_URI;
if (!mongoUri) {
    console.log('\x1b[31m%s\x1b[0m', 'Error: MongoDB connection string not found!');
    console.log('\x1b[36m%s\x1b[0m', 'Please create a .env file with either:');
    console.log('  MONGOLAB_URI=your_connection_string');
    console.log('  or');
    console.log('  MONGODB_URI=your_connection_string');
    process.exit(1);
}
mongoose.connect(mongoUri);
db = mongoose.connection;
db.on('error', (err) => {
    console.error(err);
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.');
    process.exit();
});
console.log(color_success, `Successfully connected to db.`);

/*
  Gets the user models from the database specified in the .env file.
*/
async function getUserJsons() {
    const studyLaunchDate = new Date("2024-06-06T00:00:00.000Z"); // Launch Date for Pilot Study 2
    const users = await User
        .find({ isAdmin: false, createdAt: { $gte: studyLaunchDate } })
        .populate('feedAction.post')
        .exec();
    return users;
}

async function getDataExport() {
    const users = await getUserJsons();

    console.log(color_start, `Starting the data export script...`);
    const currentDate = new Date();
    const outputFilename =
        `truman_Objections-SocialNorms-preTest-2 (timeOnPage)-dataExport` +
        `.${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}` +
        `.${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;
    const outputFilepath = `./outputFiles/pretest/${outputFilename}.csv`;
    const csvWriter_header = [
        { id: 'id', title: "Qualtrics ID" },
        { id: 'username', title: "Username" },
        { id: 'Topic', title: 'Topic' },
        { id: 'Condition', title: 'Condition' },
        { id: 'GeneralTimeSpent', title: 'GeneralTimeSpent (seconds)' },
        { id: 'V1_timespent', title: 'V1_timespent (seconds)' },
        { id: 'V2_timespent', title: 'V2_timespent (seconds)' },
        { id: 'V3_timespent', title: 'V3_timespent (seconds)' },
        { id: 'V4_timespent', title: 'V4_timespent (seconds)' },
        { id: 'V5_timespent', title: 'V5_timespent (seconds)' },
        { id: 'V6_timespent', title: 'V6_timespent (seconds)' },
        { id: 'V7_timespent', title: 'V7_timespent (seconds)' },
        { id: 'V8_timespent', title: 'V8_timespent (seconds)' },
        { id: 'V9_timespent', title: 'V9_timespent (seconds)' },
        { id: 'PageLog', title: 'PageLog' }
    ];
    const csvWriter = createCsvWriter({
        path: outputFilepath,
        header: csvWriter_header
    });
    const records = [];
    // For each user
    for (const user of users) {
        // Set default values for record
        const record = {
            GeneralTimeSpent: 0,
            V1_timespent: 0,
            V2_timespent: 0,
            V3_timespent: 0,
            V4_timespent: 0,
            V5_timespent: 0,
            V6_timespent: 0,
            V7_timespent: 0,
            V8_timespent: 0,
            V9_timespent: 0
        };

        // Record for the user
        record.id = user.mturkID;
        record.username = user.username;
        record.Topic = user.interest;
        record.Condition = user.group;

        for (let i = 0; i < user.pageLog.length - 1; i++) {
            // For video pages only:
            // Extract video number from URL (v=0,1,2,3,4,5,6,7,8)
            if (user.pageLog[i].page.startsWith("/?v=") || user.pageLog[i].page.startsWith("/tutorial?v=")) {
                // Get the time spent on this page by taking the difference between the
                // next recorded page visit.
                let timeDurationOnPage = (user.pageLog[i + 1].time.getTime() - user.pageLog[i].time.getTime()) / 1000;
                // Only include times that are shorter than 15 minutes (900 seconds).
                if (timeDurationOnPage > 900) {
                    continue;
                }
                // Extract number from URL and map to video number: v=0->V1, v=1->V2, ..., v=8->V9
                const vNum = parseInt(user.pageLog[i].page.replace(/\D/g, ''));
                const page = vNum + 1;
                if (page >= 1 && page <= 9) {
                    record[`V${page}_timespent`] += timeDurationOnPage;
                }
            }
        }

        console.log("Last Page: " + user.pageLog[user.pageLog.length - 1].page);

        if (!user.consent) {
            records.push(record);
            continue;
        }

        let string = "";
        const newPageLog = user.pageLog.filter(page => page.page != "/tutorial");
        newPageLog.forEach(page => { string += page.page + "\r\n" });
        record.PageLog = string;

        records.push(record);
    }

    await csvWriter.writeRecords(records);
    console.log(color_success, `...Data export completed.\nFile exported to: ${outputFilepath} with ${records.length} records.`);
    console.log(color_success, `...Finished reading from the db.`);
    db.close();
    console.log(color_start, 'Closed db connection.');
}

getDataExport();