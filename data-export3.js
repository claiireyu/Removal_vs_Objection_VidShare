/** Extract the comments left on video 7 and 9 */
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

// establish initial Mongoose connection, if Research Site
const mongoUri = process.env.MONGOLAB_URI || process.env.MONGODB_URI;
if (!mongoUri) {
    console.log('\x1b[31m%s\x1b[0m', 'Error: MongoDB connection string not found!');
    console.log('\x1b[36m%s\x1b[0m', 'Please create a .env file with either:');
    console.log('  MONGOLAB_URI=your_connection_string');
    console.log('  or');
    console.log('  MONGODB_URI=your_connection_string');
    process.exit(1);
}
mongoose.connect(mongoUri, { useNewUrlParser: true });
// listen for errors after establishing initial connection
db = mongoose.connection;
db.on('error', (err) => {
    console.error(err);
    console.log(color_error, '%s MongoDB connection error.');
    process.exit(1);
});
console.log(color_success, `Successfully connected to db.`);

/*
  Gets the user models from the database specified in the .env file.
*/
async function getUserJsons() {
    const studyLaunchDate = new Date("2024-06-06T00:00:00.000Z")
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
        `truman_Objections-SocialNorms-V7and8_Comments-dataExport` +
        `.${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}` +
        `.${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;
    const outputFilepath = `./outputFiles/${outputFilename}.csv`;
    const csvWriter_header = [
        { id: 'id', title: "Qualtrics ID" },
        { id: 'username', title: "Username" },
        { id: 'Topic', title: 'Topic' },
        { id: 'Condition', title: 'Condition' },
        { id: 'V7_CommentBody', title: 'V7_CommentBody' },
        { id: 'V8_CommentBody', title: 'V8_CommentBody' }
    ];
    const csvWriter = createCsvWriter({
        path: outputFilepath,
        header: csvWriter_header
    });
    const records = [];
    // For each user
    for (const user of users) {
        // Set default values for record
        const record = {};

        // Record for the user
        record.id = user.mturkID;
        record.username = user.username;
        record.Topic = user.interest;
        record.Condition = user.group;

        // For each video (feedAction)
        for (const feedAction of user.feedAction) {
            // Handle cases where post reference is missing - try to find it
            let postObj = feedAction.post;
            
            // If post is not populated (it's just an ObjectId reference), populate it
            if (!postObj || (typeof postObj === 'object' && !postObj.postID && !postObj.class)) {
                const mongoose = require('mongoose');
                const postId = postObj && postObj.toString ? postObj.toString() : postObj;
                if (postId && mongoose.Types.ObjectId.isValid(postId)) {
                    postObj = await Script.findById(postId).exec();
                } else {
                    // If still not found, try to find by class
                    const matchingPosts = await Script.find({ 
                        class: user.interest 
                    }).sort('postID').exec();
                    if (matchingPosts.length > 0) {
                        postObj = matchingPosts[0]; // Use first post as fallback
                    }
                }
            }
            
            // Ensure post object has the required properties
            if (!postObj || !postObj.class || !postObj.class.startsWith(user.interest)) {
                continue;
            }
            
            // Map postID to video number: postID 0->V1, 1->V2, ..., 8->V9
            const video = postObj.postID + 1;
            const section = video <= 6 ? "Tutorial" : "Behavioral";

            // If the video belongs to the behavioral section and not the tutorial section:
            if (section == "Behavioral" && (video == 7 || video == 8)) {
                const newComments = feedAction.comments.filter(comment => comment.new_comment);

                let string = "";
                newComments.forEach(comment => { string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + "\r\n" });
                record[`V${video}_CommentBody`] = string;
            }
        }
        // console.log(record);
        records.push(record);
    }

    await csvWriter.writeRecords(records);
    console.log(color_success, `...Data export completed.\nFile exported to: ${outputFilepath} with ${records.length} records.`);
    console.log(color_success, `...Finished reading from the db.`);
    db.close();
    console.log(color_start, 'Closed db connection.');
}

getDataExport();