const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const Script = require('./models/Script.js');
const User = require('./models/User.js');
const Actor = require('./models/Actor.js'); // Required for populating subcomments.actor
const mongoose = require('mongoose');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Console.log color shortcuts
const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

// establish initial Mongoose connection, if Research Site
mongoose.connect(process.env.MONGOLAB_URI, { useNewUrlParser: true });
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

/*
  Gets the offense1 comment information on the first video (V1).
  In the 3-video system, each category has 3 videos (postID 0,1,2 for Science; 3,4,5 for Education; 6,7,8 for Lifestyle).
  The offense1 comment is on the first video (postID 0, 3, or 6) and has class 'offense1'.
  Returns an object with both the MongoDB ObjectId and the commentID (numeric ID used for reply_to).
*/
async function getOffense1Info(interest) {
    const videoIndexes = {
        'Science': 0,      // First video (V1) for Science
        'Education': 3,   // First video (V1) for Education
        'Lifestyle': 6    // First video (V1) for Lifestyle
    };

    if (!interest || !videoIndexes.hasOwnProperty(interest)) {
        if (interest) {
            console.log(color_start, `No offense1 mapping for interest "${interest}". Skipping offense1 lookup.`);
        }
        return null;
    }

    const videoObj = await Script
        .findOne({ class: interest, postID: videoIndexes[interest] })
        .exec();

    if (!videoObj) {
        console.log(color_error, `Could not find video for interest "${interest}" with postID ${videoIndexes[interest]}.`);
        return null;
    }

    // Find the offense1 comment (harassment on first video)
    // In removal conditions, the class changes from 'offense1' to 'ai_removal_ref', 'ai_removal_no_ref', etc.
    // but the commentID (13) remains the same, so we can find it by commentID
    // The offense1 comment always has commentID 13 (based on the CSV structure)
    const offenseObj = videoObj.comments.find(comment => 
        comment.class === 'offense1' || 
        comment.commentID === 13 ||
        (comment.class && (comment.class.includes('removal') || comment.class.includes('ai_removal') || comment.class.includes('community_removal')))
    );
    if (!offenseObj) {
        console.log(color_error, `Could not find offense1 comment for interest "${interest}".`);
        return null;
    }
    return {
        objectId: offenseObj.id,      // MongoDB ObjectId
        commentID: offenseObj.commentID  // Numeric commentID used in reply_to
    };
}

/*
  Gets the objection comment information on the first video (V1).
  Objections are subcomments of the offense1 comment and have classes:
  - 'ai_objection_no_ref', 'ai_objection_community' (AI objections)
  - 'human_objection_no_ref', 'human_objection_community' (Human objections)
  Returns an object with both the MongoDB ObjectId and the commentID (numeric ID used for reply_to).
*/
async function getObjection1Info(interest) {
    const videoIndexes = {
        'Science': 0,      // First video (V1) for Science
        'Education': 3,    // First video (V1) for Education
        'Lifestyle': 6     // First video (V1) for Lifestyle
    };

    if (!videoIndexes[interest]) {
        return null;
    }

    const videoObj = await Script
        .findOne({ class: interest, postID: videoIndexes[interest] })
        .exec();

    if (!videoObj) {
        return null;
    }

    // Find the offense1 comment first
    const offense1Comment = videoObj.comments.find(comment => comment.class === 'offense1');
    if (!offense1Comment || !offense1Comment.subcomments) {
        return null;
    }

    // Find the objection subcomment (can be AI or human objection)
    const objectionSubcomment = offense1Comment.subcomments.find(subcomment => 
        subcomment.class && (
            subcomment.class.includes('ai_objection') || 
            subcomment.class.includes('human_objection')
        )
    );

    if (!objectionSubcomment) {
        return null;
    }

    return {
        objectId: objectionSubcomment.id,      // MongoDB ObjectId
        commentID: objectionSubcomment.commentID,  // Numeric commentID
        parentCommentID: offense1Comment.commentID  // Parent offense1 commentID for reply tracking
    };
}

/*
  Maps postID to video number (1-3) based on user's interest category.
  In the 3-video system:
  - Science: postID 0->V1, 1->V2, 2->V3
  - Education: postID 3->V1, 4->V2, 5->V3
  - Lifestyle: postID 6->V1, 7->V2, 8->V3
*/
function getVideoNumber(postID, interest) {
    const categoryOffsets = {
        'Science': 0,
        'Education': 3,
        'Lifestyle': 6
    };
    
    const offset = categoryOffsets[interest] || 0;
    const videoIndex = postID - offset;
    
    // Return video number (1-3) if within valid range, otherwise return null
    if (videoIndex >= 0 && videoIndex < 3) {
        return videoIndex + 1; // Convert 0-based to 1-based (V1, V2, V3)
    }
    return null;
}

async function getDataExport() {
    const users = await getUserJsons();

    console.log(color_start, `Starting the data export script...`);
    const currentDate = new Date();
    const outputFilename =
        `truman_Objections-SocialNorms-dataExport` +
        `.${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}` +
        `.${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;
    const outputDir = path.resolve(__dirname, 'outputFiles');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(color_start, `Created output directory at ${outputDir}`);
    }
    const outputFilepath = path.join(outputDir, `${outputFilename}.csv`);
    const csvWriter_header = [
        { id: 'id', title: "Qualtrics ID" },
        { id: 'username', title: "Username" },
        { id: 'Topic', title: 'Topic' },
        { id: 'Condition', title: 'Condition' },
        { id: 'NumVideosVisited', title: 'NumVideosVisited (Of the first 3 videos, the number of video pages the participant visited)' },
        { id: 'V1_visited', title: 'V1_visited (T/F)' },
        { id: 'V2_visited', title: 'V2_visited (T/F)' },
        { id: 'V3_visited', title: 'V3_visited (T/F)' },
        { id: 'V1_timespent', title: 'V1_timespent: Amount of time spent on the video_one page (in secs)' },
        { id: 'V2_timespent', title: 'V2_timespent: Amount of time spent on the video_two page (in secs)' },
        { id: 'V3_timespent', title: 'V3_timespent: Amount of time spent on the video_three page (in secs)' },
        { id: 'AvgTimeOnVideoPage', title: 'AvgTimeOnVideoPage (in secs)' },
        { id: 'PageLog', title: 'PageLog' },
        { id: 'VideoUpvoteNumber', title: 'VideoUpvoteNumber' },
        { id: 'VideoDownvoteNumber', title: 'VideoDownvoteNumber' },
        { id: 'VideoFlagNumber', title: 'VideoFlagNumber' },
        { id: 'CommentUpvoteNumber', title: 'CommentUpvoteNumber (excluding stimuli msg)' },
        { id: 'V1_CommentUpvoteNumber', title: 'V1_CommentUpvoteNumber' },
        { id: 'V2_CommentUpvoteNumber', title: 'V2_CommentUpvoteNumber' },
        { id: 'V3_CommentUpvoteNumber', title: 'V3_CommentUpvoteNumber' },
        { id: 'CommentDownvoteNumber', title: 'CommentDownvoteNumber (excluding stimuli msg)' },
        { id: 'V1_CommentDownvoteNumber', title: 'V1_CommentDownvoteNumber' },
        { id: 'V2_CommentDownvoteNumber', title: 'V2_CommentDownvoteNumber' },
        { id: 'V3_CommentDownvoteNumber', title: 'V3_CommentDownvoteNumber' },
        { id: 'CommentFlagNumber', title: 'CommentFlagNumber (excluding stimuli msg)' },
        { id: 'V1_CommentFlagNumber', title: 'V1_CommentFlagNumber' },
        { id: 'V2_CommentFlagNumber', title: 'V2_CommentFlagNumber' },
        { id: 'V3_CommentFlagNumber', title: 'V3_CommentFlagNumber' },
        { id: 'GeneralPostComments', title: 'GeneralPostComments (excluding replies to the stimuli msg)' },
        { id: 'V1_PostComments', title: 'V1_PostComments' },
        { id: 'V2_PostComments', title: 'V2_PostComments' },
        { id: 'V3_PostComments', title: 'V3_PostComments' },
        { id: 'Off1_Appear', title: 'Off1_Appear (T/F) - Indicates if participant visited V1 (where offense1 appears)' },
        { id: 'Off1_Upvote', title: 'Off1_Upvote (T/F)' },
        { id: 'Off1_Downvote', title: 'Off1_Downvote (T/F)' },
        { id: 'Off1_Flag', title: 'Off1_Flag (T/F)' },
        { id: 'Off1_Reply', title: 'Off1_Reply (T/F)' },
        { id: 'Off1_ReplyBody', title: 'Off1_ReplyBody' },
        { id: 'Obj1_Appear', title: 'Obj1_Appear (T/F) - Indicates if participant visited V1 (where objection appears)' },
        { id: 'Obj1_Upvote', title: 'Obj1_Upvote (T/F)' },
        { id: 'Obj1_Downvote', title: 'Obj1_Downvote (T/F)' },
        { id: 'Obj1_Flag', title: 'Obj1_Flag (T/F)' },
        { id: 'Obj1_Reply', title: 'Obj1_Reply (T/F)' },
        { id: 'Obj1_ReplyBody', title: 'Obj1_ReplyBody' },
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
            NumVideosVisited: 0,
            V1_visited: false,
            V2_visited: false,
            V3_visited: false,
            V1_timespent: 0,
            V2_timespent: 0,
            V3_timespent: 0,
            AvgTimeOnVideoPage: 0,
            VideoUpvoteNumber: 0,
            VideoDownvoteNumber: 0,
            VideoFlagNumber: 0,
            CommentUpvoteNumber: 0,
            V1_CommentUpvoteNumber: 0,
            V2_CommentUpvoteNumber: 0,
            V3_CommentUpvoteNumber: 0,
            CommentDownvoteNumber: 0,
            V1_CommentDownvoteNumber: 0,
            V2_CommentDownvoteNumber: 0,
            V3_CommentDownvoteNumber: 0,
            CommentFlagNumber: 0,
            V1_CommentFlagNumber: 0,
            V2_CommentFlagNumber: 0,
            V3_CommentFlagNumber: 0,
            GeneralPostComments: 0,
            V1_PostComments: 0,
            V2_PostComments: 0,
            V3_PostComments: 0,
            Off1_Appear: false,
            Off1_Upvote: false,
            Off1_Downvote: false,
            Off1_Flag: false,
            Off1_Reply: false,
            Off1_ReplyBody: '',
            Obj1_Appear: false,
            Obj1_Upvote: false,
            Obj1_Downvote: false,
            Obj1_Flag: false,
            Obj1_Reply: false,
            Obj1_ReplyBody: ''
        };

        // Record for the user
        record.id = user.mturkID || '';
        record.username = user.username || '';
        record.Topic = user.interest || 'None';
        record.Condition = user.group || 'None';

        // Extract pages visited on the website
        // In the 3-video system, users see videos based on their interest category
        // URLs contain ?v=postID where postID is 0-2 for Science, 3-5 for Education, 6-8 for Lifestyle
        let NumVideosVisited = 0;
        let Off1_Appear = false;

        for (const pageLog of user.pageLog) {
            if (pageLog.page.startsWith("/?v=") || pageLog.page.startsWith("/tutorial?v=")) {
                // Extract postID from URL (e.g., "/?v=2" -> 2)
                const postID = parseInt(pageLog.page.replace(/\D/g, ''));
                if (isNaN(postID)) continue;
                
                // Map postID to video number (1-3) based on user's interest
                const videoNum = getVideoNumber(postID, user.interest);
                if (videoNum && videoNum >= 1 && videoNum <= 3) {
                    if (record[`V${videoNum}_visited`] == false) {
                        record[`V${videoNum}_visited`] = true;
                        NumVideosVisited++;
                        
                        // Track if V1 was visited (where offense1 appears)
                        if (videoNum == 1) {
                            Off1_Appear = true;
                            record.Off1_Upvote = false;
                            record.Off1_Downvote = false;
                            record.Off1_Flag = false;
                            record.Off1_Reply = false;
                            // Objection only appears on V1 for non-removal conditions
                            // For removal conditions (Rem:*), there is no objection comment
                            const isRemovalCondition = user.condition && user.condition.startsWith('Rem:');
                            record.Obj1_Appear = !isRemovalCondition; // Only true if not a removal condition
                            record.Obj1_Upvote = false;
                            record.Obj1_Downvote = false;
                            record.Obj1_Flag = false;
                            record.Obj1_Reply = false;
                        }
                        
                    }
                }
            }
        }

        record.NumVideosVisited = NumVideosVisited;
        record.Off1_Appear = Off1_Appear;

        if (!user.consent) {
            records.push(record);
            continue;
        }

        let sumOnVideos = 0;
        let numVideos = 0;
        
        for (let pageTime of user.pageTimes) {
            if (pageTime.time > 1500 && (pageTime.page.startsWith("/?v=") || pageTime.page.startsWith("/tutorial?v="))) {
                // Extract postID from URL (e.g., "/?v=2" -> 2)
                const postID = parseInt(pageTime.page.replace(/\D/g, ''));
                if (!isNaN(postID)) {
                    // Map postID to video number (1-3) based on user's interest
                    const videoNum = getVideoNumber(postID, user.interest);
                    if (videoNum && videoNum >= 1 && videoNum <= 3) {
                        // Add time spent (convert from milliseconds to seconds)
                        record[`V${videoNum}_timespent`] += pageTime.time / 1000;
                    }
                }
                numVideos++;
                sumOnVideos += pageTime.time;
            }
        }

        // Calculate average time, defaulting to 0 if no valid video page times found
        record.AvgTimeOnVideoPage = numVideos > 0 ? (sumOnVideos / numVideos) / 1000 : 0;

        let VideoUpvoteNumber = 0;
        let VideoDownvoteNumber = 0;
        let VideoFlagNumber = 0;

        let CommentUpvoteNumber = 0;
        let CommentDownvoteNumber = 0;
        let CommentFlagNumber = 0;
        let GeneralPostComments = 0;

        // Get offense and objection info for V1 and V3
        const offense1Info = await getOffense1Info(user.interest);
        const offense1Id = offense1Info ? offense1Info.objectId : null;
        const offense1CommentID = offense1Info ? offense1Info.commentID : null;
        
        const objection1Info = await getObjection1Info(user.interest);
        const objection1Id = objection1Info ? objection1Info.objectId : null;
        const objection1CommentID = objection1Info ? objection1Info.commentID : null;
        const offense1ParentCommentID = objection1Info ? objection1Info.parentCommentID : null;

        // For each video (feedAction)
        // In the 3-video system, all videos are part of the main study (no tutorial/behavioral distinction)
        for (const feedAction of user.feedAction) {
            // Skip if post wasn't populated (the referenced post doesn't exist in database)
            if (!feedAction.post) {
                // Silently skip - this happens when feedAction references a post that was deleted/recreated
                continue;
            }
            if (!feedAction.post.class || feedAction.post.postID === undefined) {
                console.log(color_error, `Feed action has invalid post data for user ${user.username}. Skipping entry.`);
                continue;
            }
            if (!feedAction.post.class.startsWith(user.interest)) {
                continue;
            }
            
            // Map postID to video number (1-3) based on user's interest
            const video = getVideoNumber(feedAction.post.postID, user.interest);
            if (!video || video < 1 || video > 3) {
                // Skip if video number is not in valid range (1-3)
                continue;
            }

            // Track video interactions
            if (feedAction.liked) {
                VideoUpvoteNumber++;
            }
            if (feedAction.unliked) {
                VideoDownvoteNumber++;
            }
            if (feedAction.flagged) {
                VideoFlagNumber++;
            }
            
            // Filter comments (excluding offense and objection comments)
            // For V1: exclude offense1 and objection comments (including subcomments)
            // For V2 and V3: no exclusions needed (treat all existing comments the same)
            let generalComments;
            if (user.interest == "None-True") {
                generalComments = feedAction.comments.filter(comment => !comment.new_comment);
            } else if (video == 1) {
                // V1: exclude offense1 and objection comments
                // Objections are added dynamically as subcomments of offense1, so they're not in the Script model
                // We need to identify them by checking if a comment ObjectId is NOT a top-level comment
                // and NOT a subcomment of any other comment (meaning it's likely a subcomment of offense1)
                let allKnownCommentIds = new Set();
                let allKnownSubcommentIds = new Set();
                
                if (feedAction.post && feedAction.post._id) {
                    // Get the post to build sets of known comment/subcomment ObjectIds
                    const postDoc = await Script.findById(feedAction.post._id).exec();
                    if (postDoc) {
                        // Collect all top-level comment ObjectIds
                        postDoc.comments.forEach(comment => {
                            if (comment.id) {
                                allKnownCommentIds.add(comment.id.toString());
                            }
                            // Collect all subcomment ObjectIds
                            if (comment.subcomments) {
                                comment.subcomments.forEach(subcomment => {
                                    if (subcomment.id) {
                                        allKnownSubcommentIds.add(subcomment.id.toString());
                                    }
                                });
                            }
                        });
                    }
                }
                
                generalComments = feedAction.comments.filter(comment => {
                    if (comment.new_comment) return false;
                    if (!comment.comment) return true;
                    
                    const commentIdStr = comment.comment.toString();
                    
                    // Exclude offense1 comment
                    if (offense1Id && commentIdStr === offense1Id.toString()) return false;
                    
                    // Exclude objection subcomments
                    // Objections are dynamically added subcomments of offense1, so they won't be in the Script model
                    // We can identify them by checking if they're NOT in the known comment/subcomment sets
                    if (objection1Id && commentIdStr === objection1Id.toString()) return false;
                    
                    // If this comment ObjectId is NOT a known top-level comment AND NOT a known subcomment,
                    // it's likely a dynamically added objection subcomment of offense1 (since objections are the only
                    // dynamically added subcomments on V1)
                    const isKnownComment = allKnownCommentIds.has(commentIdStr);
                    const isKnownSubcomment = allKnownSubcommentIds.has(commentIdStr);
                    if (!isKnownComment && !isKnownSubcomment) {
                        // This ObjectId is not in the Script model, so it's likely a dynamically added objection
                        return false;
                    }
                    
                    return true;
                });
            } else {
                // V2 and V3: no exclusions needed (offense3 doesn't need to be excluded)
                generalComments = feedAction.comments.filter(comment => !comment.new_comment);
            }

            const numLikes = generalComments.filter(comment => comment.liked).length;
            const numDislikes = generalComments.filter(comment => comment.unliked).length;
            const numFlagged = generalComments.filter(comment => comment.flagged).length;
            
            // Filter new comments (excluding replies to offense/objection comments)
            // For V1: exclude replies to offense1 and objection
            // For V2 and V3: no exclusions needed (count all new comments)
            let newComments;
            if (user.interest == "None-True") {
                newComments = feedAction.comments.filter(comment => comment.new_comment);
            } else if (video == 1) {
                // V1: exclude replies to offense1 and objection
                // Normalize types for comparison (reply_to might be string or number)
                const normalizedOffense1CommentID = offense1CommentID !== null ? Number(offense1CommentID) : null;
                const normalizedObjection1CommentID = objection1CommentID !== null ? Number(objection1CommentID) : null;
                const normalizedOffense1ParentCommentID = offense1ParentCommentID !== null ? Number(offense1ParentCommentID) : null;
                
                newComments = feedAction.comments.filter(comment => {
                    if (!comment.new_comment) return false;
                    if (comment.reply_to == null) return true; // Not a reply, include it
                    
                    // Normalize reply_to to number for comparison
                    const normalizedReplyTo = Number(comment.reply_to);
                    
                    // Exclude replies to offense1
                    if (normalizedOffense1CommentID !== null && normalizedReplyTo === normalizedOffense1CommentID) return false;
                    // Exclude replies to objection (commentID 96)
                    if (normalizedReplyTo === 96) return false;
                    // Also check objection1CommentID if it was found (for backwards compatibility)
                    if (normalizedObjection1CommentID !== null && normalizedReplyTo === normalizedObjection1CommentID) return false;
                    // Also exclude replies to offense1 parent if objection is a subcomment
                    if (normalizedOffense1ParentCommentID !== null && normalizedReplyTo === normalizedOffense1ParentCommentID) return false;
                    return true;
                });
            } else {
                // V2 and V3: no exclusions needed (count all new comments, including replies)
                newComments = feedAction.comments.filter(comment => comment.new_comment);
            }
            const numNewComments = newComments.length;

            CommentUpvoteNumber += numLikes;
            CommentDownvoteNumber += numDislikes;
            CommentFlagNumber += numFlagged;
            GeneralPostComments += numNewComments;

            record[`V${video}_CommentUpvoteNumber`] += numLikes;
            record[`V${video}_CommentDownvoteNumber`] += numDislikes;
            record[`V${video}_CommentFlagNumber`] += numFlagged;
            record[`V${video}_PostComments`] += numNewComments;

            // Track offense1 and objection interactions on V1 (first video)
            if (video == 1 && user.interest != "None-True") {
                // Track offense1 interactions
                if (offense1Id && offense1CommentID !== null) {
                    // Normalize offense1Id to string for comparison
                    const offense1IdStr = offense1Id.toString();
                    
                    // Try to find offense1 interaction by ObjectId
                    // comment.comment can be stored as ObjectId instance or string, so normalize both
                    let off1Obj = feedAction.comments.find(comment => {
                        if (comment.new_comment || !comment.comment) return false;
                        const commentIdStr = comment.comment.toString();
                        return commentIdStr === offense1IdStr;
                    });
                    
                    // Fallback: If not found by direct ObjectId match, query the post document
                    // to get the actual offense1 comment ObjectId and try matching again
                    // This handles cases where the ObjectId might have been modified or stored differently
                    // In removal conditions, the class changes from 'offense1' to 'ai_removal_ref', 'ai_removal_no_ref', etc.
                    // but the commentID (13) and ObjectId remain the same
                    if (!off1Obj && feedAction.post && feedAction.post._id) {
                        const postDoc = await Script.findById(feedAction.post._id).exec();
                        if (postDoc && offense1CommentID !== null) {
                            // Find offense1 comment by commentID (works for all conditions including removal)
                            // In removal conditions, class changes but commentID stays the same
                            const offense1Comment = postDoc.comments.find(c => 
                                c.commentID === offense1CommentID || 
                                c.class === 'offense1' ||
                                (c.class && (c.class.includes('removal') || c.class.includes('ai_removal') || c.class.includes('community_removal')))
                            );
                            if (offense1Comment && offense1Comment.id) {
                                const actualOffense1IdStr = offense1Comment.id.toString();
                                // Try matching with the actual ObjectId from the post document
                                off1Obj = feedAction.comments.find(comment => {
                                    if (comment.new_comment || !comment.comment) return false;
                                    const commentIdStr = comment.comment.toString();
                                    return commentIdStr === actualOffense1IdStr || commentIdStr === offense1IdStr;
                                });
                            }
                        }
                    }
                    
                    // Additional fallback: If still not found, try matching by commentID
                    // This is safer than matching by count, as it ensures we get the correct comment
                    if (!off1Obj && feedAction.post && feedAction.post._id && offense1CommentID !== null) {
                        const postDoc = await Script.findById(feedAction.post._id).exec();
                        if (postDoc) {
                            // Find offense1 comment by commentID (most reliable identifier)
                            const offense1Comment = postDoc.comments.find(c => c.commentID === offense1CommentID);
                            if (offense1Comment && offense1Comment.id) {
                                const actualOffense1IdStr = offense1Comment.id.toString();
                                // Try matching with the actual ObjectId from the post document
                                off1Obj = feedAction.comments.find(comment => {
                                    if (comment.new_comment || !comment.comment) return false;
                                    const commentIdStr = comment.comment.toString();
                                    return commentIdStr === actualOffense1IdStr;
                                });
                            }
                        }
                    }
                    
                    record.Off1_Upvote = (off1Obj != undefined && off1Obj != null) ? off1Obj.liked : false;
                    record.Off1_Downvote = (off1Obj != undefined && off1Obj != null) ? off1Obj.unliked : false;
                    record.Off1_Flag = (off1Obj != undefined && off1Obj != null) ? off1Obj.flagged : false;
                    
                    // Find replies to offense1 comment
                    // Normalize types for comparison (reply_to might be stored as string or number)
                    const normalizedOffense1CommentID = offense1CommentID != null ? Number(offense1CommentID) : null;
                    const replyToOffense1 = feedAction.comments.filter(comment => {
                        if (!comment.new_comment || comment.reply_to == null) return false;
                        // Normalize reply_to to number for comparison
                        const normalizedReplyTo = Number(comment.reply_to);
                        return normalizedReplyTo === normalizedOffense1CommentID;
                    });
                    
                    if (replyToOffense1.length != 0) {
                        let string = "";
                        replyToOffense1.forEach(comment => { 
                            string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + " | " 
                        });
                        // Remove trailing separator
                        if (string.endsWith(" | ")) {
                            string = string.slice(0, -3);
                        }
                        record.Off1_ReplyBody = string;
                        record.Off1_Reply = true;
                    } else {
                        record.Off1_Reply = false;
                        record.Off1_ReplyBody = '';
                    }
                }
                
                // Track objection interactions
                // For removal conditions (Rem:*), there is no objection comment, so all Obj1_* fields should be false
                const isRemovalCondition = user.condition && user.condition.startsWith('Rem:');
                if (isRemovalCondition) {
                    // For removal conditions, ensure all Obj1 fields are false (they should already be false from defaults)
                    record.Obj1_Appear = false;
                    record.Obj1_Upvote = false;
                    record.Obj1_Downvote = false;
                    record.Obj1_Flag = false;
                    record.Obj1_Reply = false;
                    record.Obj1_ReplyBody = '';
                } else {
                    // Objections are dynamically added subcomments of offense1, so they're not in the Script model
                    // We can identify them the same way as in filtering - by checking if ObjectId is NOT in Script model
                    let obj1Obj = null;
                    
                    // First try to find by objection1Id if it was found (for backwards compatibility)
                    if (objection1Id) {
                        obj1Obj = feedAction.comments.find(comment => 
                            !comment.new_comment && 
                            comment.comment && 
                            comment.comment.toString() == objection1Id.toString()
                        );
                    }
                    
                    // If not found, check for comments that are NOT in the Script model (dynamically added objections)
                    if (!obj1Obj && feedAction.post && feedAction.post._id) {
                        const postDoc = await Script.findById(feedAction.post._id).exec();
                        if (postDoc) {
                            const allKnownCommentIds = new Set();
                            const allKnownSubcommentIds = new Set();
                            postDoc.comments.forEach(comment => {
                                if (comment.id) allKnownCommentIds.add(comment.id.toString());
                                if (comment.subcomments) {
                                    comment.subcomments.forEach(subcomment => {
                                        if (subcomment.id) allKnownSubcommentIds.add(subcomment.id.toString());
                                    });
                                }
                            });
                            
                            // Find the objection interaction - it's a comment ObjectId that's NOT in Script model
                            // and is NOT the offense1 comment
                            obj1Obj = feedAction.comments.find(comment => {
                                if (comment.new_comment || !comment.comment) return false;
                                const commentIdStr = comment.comment.toString();
                                // Exclude offense1
                                if (offense1Id && commentIdStr === offense1Id.toString()) return false;
                                // Check if it's NOT in Script model (meaning it's a dynamically added objection)
                                const isKnownComment = allKnownCommentIds.has(commentIdStr);
                                const isKnownSubcomment = allKnownSubcommentIds.has(commentIdStr);
                                return !isKnownComment && !isKnownSubcomment;
                            });
                        }
                    }
                    
                    // Additional fallback: Check if comment.comment is 96 (objection commentID)
                    // This handles cases where the frontend sends commentID: 96 and backend stores it as a number
                    if (!obj1Obj) {
                        obj1Obj = feedAction.comments.find(comment => {
                            if (comment.new_comment || !comment.comment) return false;
                            // Check if comment.comment is 96 (objection commentID) or "96"
                            const commentValue = comment.comment;
                            return commentValue === 96 || commentValue === "96" || String(commentValue) === "96";
                        });
                    }
                    
                    record.Obj1_Upvote = (obj1Obj != undefined && obj1Obj != null) ? obj1Obj.liked : false;
                    record.Obj1_Downvote = (obj1Obj != undefined && obj1Obj != null) ? obj1Obj.unliked : false;
                    record.Obj1_Flag = (obj1Obj != undefined && obj1Obj != null) ? obj1Obj.flagged : false;
                    
                    // Find replies to objection comment
                    // Objections always have commentID 96 (as defined in helpers.js when they're added dynamically)
                    // So we check for replies with reply_to == 96
                    // We also check objection1CommentID if it was found (for backwards compatibility)
                    const objectionCommentID = objection1CommentID !== null ? objection1CommentID : 96;
                    const replyToObjection1 = feedAction.comments.filter(comment => 
                        comment.new_comment && 
                        comment.reply_to != null && 
                        comment.reply_to == objectionCommentID
                    );
                    
                    if (replyToObjection1.length != 0) {
                        let string = "";
                        replyToObjection1.forEach(comment => { 
                            string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + " | " 
                        });
                        // Remove trailing separator
                        if (string.endsWith(" | ")) {
                            string = string.slice(0, -3);
                        }
                        record.Obj1_ReplyBody = string;
                        record.Obj1_Reply = true;
                    } else {
                        record.Obj1_Reply = false;
                        record.Obj1_ReplyBody = '';
                    }
                }
            }

        }

        let string = "";
        const newPageLog = user.pageLog.filter(page => page.page != "/tutorial");
        newPageLog.forEach(page => { string += page.page + " | " });
        // Remove trailing separator
        if (string.endsWith(" | ")) {
            string = string.slice(0, -3);
        }
        record.PageLog = string;

        record.VideoUpvoteNumber = VideoUpvoteNumber;
        record.VideoDownvoteNumber = VideoDownvoteNumber;
        record.VideoFlagNumber = VideoFlagNumber;
        record.CommentUpvoteNumber = CommentUpvoteNumber;
        record.CommentDownvoteNumber = CommentDownvoteNumber;
        record.CommentFlagNumber = CommentFlagNumber;
        record.GeneralPostComments = GeneralPostComments;

        records.push(record);
    }

    await csvWriter.writeRecords(records);
    console.log(color_success, `...Data export completed.\nFile exported to: ${outputFilepath} with ${records.length} records.`);
    console.log(color_success, `...Finished reading from the db.`);
    db.close();
    console.log(color_start, 'Closed db connection.');
}

getDataExport();