const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

console.log(color_start, 'Started populate.js script ');

var async = require('async');
var Actor = require('./models/Actor.js');
var Script = require('./models/Script.js');
const _ = require('lodash');
const dotenv = require('dotenv');
var mongoose = require('mongoose');
const CSVToJSON = require("csvtojson");

//Input Files
const actor_inputFile = './input/actors.csv';
const posts_inputFile = './input/posts.csv';
const replies_inputFile = './input/replies.csv';

// Variables to be used later.
var actors_list;
var posts_list;
var comment_list;

dotenv.config({ path: '.env' });

/**
 * Connect to MongoDB.
 */
mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.on('error', (err) => {
    console.error(err);
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.');
    process.exit();
});

/*
This is a huge function of chained promises, done to achieve serial completion of asynchronous actions.
There's probably a better way to do this, but this worked.
*/
async function doPopulate() {
    /****
    Dropping collections
    ****/
    let promise = new Promise((resolve, reject) => { //Drop the actors collection
            console.log(color_start, "Dropping actors...");
            db.collections['actors'].drop(function(err) {
                console.log(color_success, 'Actors collection dropped');
                resolve("done");
            });
        }).then(function(result) { //Drop the scripts collection
            return new Promise((resolve, reject) => {
                console.log(color_start, "Dropping scripts...");
                db.collections['scripts'].drop(function(err) {
                    console.log(color_success, 'Scripts collection dropped');
                    resolve("done");
                });
            });
        })
        /***
        Converting CSV files to JSON
        ***/
        .then(function(result) { //Convert the actors csv file to json, store in actors_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading actors list...");
                CSVToJSON().fromFile(actor_inputFile).then(function(json_array) {
                    actors_list = json_array;
                    console.log(color_success, "Finished getting the actors_list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the posts csv file to json, store in posts_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading posts list...");
                CSVToJSON().fromFile(posts_inputFile).then(function(json_array) {
                    posts_list = json_array;
                    console.log(color_success, "Finished getting the posts list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the comments csv file to json, store in comment_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading comment list...");
                CSVToJSON().fromFile(replies_inputFile).then(function(json_array) {
                    comment_list = json_array;
                    console.log(color_success, "Finished getting the comment list");
                    resolve("done");
                });
            });
            /*************************
            Create all the Actors in the simulation
            Must be done before creating any other instances
            *************************/
        }).then(function(result) {
            console.log(color_start, "Starting to populate actors collection...");
            return new Promise((resolve, reject) => {
                async.each(actors_list, async function(actor_raw, callback) {
                        const actordetail = {
                            username: actor_raw.username,
                            profile: {
                                name: actor_raw.name,
                                location: actor_raw.location,
                                bio: actor_raw.bio,
                                color: actor_raw.color,
                                picture: actor_raw.picture
                            },
                            class: actor_raw.class
                        };

                        const actor = new Actor(actordetail);
                        try {
                            await actor.save();
                        } catch (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving actor in database");
                            callback(err);
                        }
                    },
                    function(err) {
                        if (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving actors in database");
                            callback(err);
                        }
                        // Return response
                        console.log(color_success, "All actors added to database!")
                        resolve('Promise is resolved successfully.');
                        return 'Loaded Actors';
                    }
                );
            });
            /*************************
            Create each post and upload it to the DB
            Actors must be in DB first to add them correctly to the post
            *************************/
        }).then(function(result) {
            console.log(color_start, "Starting to populate posts collection...");
            return new Promise((resolve, reject) => {
                async.each(posts_list, async function(new_post, callback) {
                        const act = await Actor.findOne({ username: new_post.actor }).exec();
                        if (act) {
                            const postdetail = {
                                postID: new_post.id,
                                body: new_post.body,
                                picture: new_post.picture,
                                likes: new_post.likes || getLikes(),
                                unlikes: new_post.dislikes || getUnlikes(),
                                actor: act,
                                time: new_post.time || null,
                                class: new_post.class,
                                length: new_post.length
                            }

                            const script = new Script(postdetail);
                            try {
                                await script.save();
                            } catch (err) {
                                console.log(color_error, "ERROR: Something went wrong with saving post in database");
                                callback(err);
                            }
                        } else { //Else no actor found
                            console.log(color_error, "ERROR: Actor not found in database");
                            console.log(act);
                        }
                    },
                    function(err) {
                        if (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving posts in database");
                            callback(err);
                        }
                        // Return response
                        console.log(color_success, "All posts added to database!")
                        resolve('Promise is resolved successfully.');
                        return 'Loaded Posts';
                    }
                );
            });
            /*************************
            Creates inline comments for each post
            Looks up actors and posts to insert the correct comment
            Does this in series to insure comments are put in the correct order
            Takes a while to run because of this.
            *************************/
        }).then(async function(result) {
            console.log(color_start, "Starting to populate post replies...");
            // Process comments sequentially using for loop (better for async/await)
            for (let i = 0; i < comment_list.length; i++) {
                const new_reply = comment_list[i];
                try {
                        const act = await Actor.findOne({ username: new_reply.actor }).exec();
                        if (act) {
                            // Ensure postID is parsed correctly
                            const postId = parseInt(new_reply.reply);
                            const pr = await Script.findOne({ postID: postId }).exec();
                            if (pr) {
                                // Ensure commentID is a number
                                const commentId = parseInt(new_reply.id);
                                // Use class-2 if class is empty (for offense3 comments)
                                const commentClass = new_reply.class || new_reply['class-2'] || null;
                                let comment_detail = {
                                    commentID: commentId,
                                    body: new_reply.body,
                                    likes: new_reply.likes || getLikesComment(),
                                    unlikes: new_reply.dislikes || getUnlikesComment(),
                                    actor: act,
                                    time: new_reply.time ? timeStringToNum(new_reply.time) : null,
                                    class: commentClass,

                                    subcomments: []
                                };

                                // Is a second-level reply?
                                // Check if replyTo exists and is not an empty string
                                if (new_reply.replyTo && new_reply.replyTo !== '' && new_reply.replyTo !== 'undefined') {
                                    const replyToId = parseInt(new_reply.replyTo);
                                    const comment = pr.comments.find((comment) => {
                                        return comment.commentID == replyToId || comment.commentID === replyToId || String(comment.commentID) === String(replyToId);
                                    });
                                    if (comment) {
                                        comment.subcomments.push(comment_detail);
                                        comment.subcomments.sort(function(a, b) { return b.time - a.time; });
                                    } else {
                                        continue; // Skip this comment and continue to next
                                    }
                                } // Is a parent reply?
                                else {
                                    pr.comments.push(comment_detail);
                                    pr.comments.sort(function(a, b) { return b.time - a.time; });
                                }

                                try {
                                    await pr.save();
                                } catch (err) {
                                    console.log(color_error, "ERROR: Something went wrong with saving reply in database");
                                    console.log(color_error, err);
                                    // Continue processing other comments even if one fails
                                }
                            }
                        }
                } catch (err) {
                    console.log(color_error, `Unexpected error processing reply ID ${new_reply.id}: ${err.message}`);
                    console.log(color_error, err);
                    // Continue processing other comments
                }
            }
            
            console.log(color_success, "All replies added to database!");
            mongoose.connection.close();
            return 'Loaded Replies';
        })
}

//capitalize a string
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

//Transforms a time like -12:32 (minus 12 hours and 32 minutes) into a time in milliseconds
//Positive numbers indicate future posts (after they joined), Negative numbers indicate past posts (before they joined)
//Format: (+/-)HH:MM
function timeStringToNum(v) {
    var timeParts = v.split(":");
    if (timeParts[0] == "-0")
    // -0:XX
        return -1 * parseInt(((timeParts[0] * (60000 * 60)) + (timeParts[1] * 60000)), 10);
    else if (timeParts[0].startsWith('-'))
    //-X:XX
        return parseInt(((timeParts[0] * (60000 * 60)) + (-1 * (timeParts[1] * 60000))), 10);
    else
        return parseInt(((timeParts[0] * (60000 * 60)) + (timeParts[1] * 60000)), 10);
};

//Create a random number (for the number of likes) with a weighted distrubution
//This is for posts
function getLikes() {
    var notRandomNumbers = [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}

function getUnlikes() {
    var notRandomNumbers = [0, 0, 0, 0, 0, 1, 1, 1];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}

//Create a radom number (for likes) with a weighted distrubution
//This is for comments
function getLikesComment() {
    var notRandomNumbers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}

function getUnlikesComment() {
    var notRandomNumbers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}

//Call the function with the long chain of promises
doPopulate();