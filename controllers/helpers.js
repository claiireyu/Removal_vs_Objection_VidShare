const _ = require('lodash');
const mongoose = require('mongoose');
const Script = require('../models/Script.js');
const Actor = require('../models/Actor');
require('dotenv').config();

/**
 * Helper: Set harassment comment time to -6:00 (6 hours before user creation)
 * This ensures harassment comments appear before objection comments (3 hours ago)
 */
function setHarassmentCommentTime(comment) {
    const HARASSMENT_TIME_OFFSET = -6 * 60 * 60 * 1000; // -6 hours in milliseconds
    comment.time = HARASSMENT_TIME_OFFSET;
    if (typeof comment.markModified === 'function') {
        comment.markModified('time');
    }
}

/**
 * Helper: Serialize actor for use in subcomments (ensures profile is plain object)
 */
function serializeActorForSubcomment(actor) {
    let actorForSubcomment = actor;
    if (actor.toObject) {
        actorForSubcomment = actor.toObject();
    }
    // Ensure profile is a plain object, not a Mongoose subdocument
    if (actorForSubcomment.profile && typeof actorForSubcomment.profile.toObject === 'function') {
        actorForSubcomment.profile = actorForSubcomment.profile.toObject();
    }
    return actorForSubcomment;
}

/**
 * Helper: Set actor to [deleted] for removal conditions
 */
function setDeletedActor(comment, originalActor) {
    comment.actor = {
        username: '[deleted]',
        profile: {
            name: '',
            location: '',
            bio: '',
            color: '#9bbcd6',
            picture: '30_bat.svg'
        },
        _id: originalActor._id || originalActor.id
    };
}

/**
 * This is a helper function. It takes in a User document. 
 * Function processes and returns a final feed of posts for the main study (3 videos total).
 * This is where users can freely interact with harassment content to measure the effect
 * of the experimental condition they experienced.
 * Parameters: 
 *  - user: a User document
 * Returns: 
 *  - finalfeed: the processed final feed of posts for the user
 */
exports.getFeed = async function(user) {
    // Get the newsfeed for main study (3 videos total)
    let script_feed = await Script.find()
        .where('class').equals(user.interest)
        .sort('postID')
        .populate('actor')
        .populate('comments.actor')
        .populate('comments.subcomments.actor')
        .exec();
    

    // Apply experimental manipulations to videos
    await applyExperimentalManipulations(script_feed, user);

    // Re-apply harassment comment time to ensure it's set correctly
    // Set all LOL harassment comments to -6:00 (6 hours before user creation) across all videos
    // This ensures the harassment comment always shows "6 hours ago" (before objection comments at "3 hours ago")
    script_feed.forEach((video, videoIndex) => {
        // Safety check: ensure video has comments array
        if (!video || !video.comments || !Array.isArray(video.comments)) {
            return;
        }
        // Find all LOL harassment comments in this video (including removal variants)
        // In removal conditions, the class changes but commentID stays the same
        const harassmentComments = video.comments.filter(comment => 
            comment && (
                (comment.class === 'offense1' && comment.body && comment.body.includes("LOL, did you even preview")) ||
                (comment.class && (comment.class.includes('removal') || comment.class.includes('ai_removal') || comment.class.includes('community_removal')))
            )
        );
        harassmentComments.forEach(harassmentComment => {
            setHarassmentCommentTime(harassmentComment);
        });
    });

    // Final array of all posts to go in the feed
    let finalfeed = [];

    // While there are regular posts to add to the final feed
    while (script_feed.length) {
        let replyDictionary = {}; // where Key = parent comment reply falls under, value = the list of comment objects

        // Looking at the post in script_feed[0] now.
        // For this post, check if there is a user feedAction matching this post's ID and get its index.
        const feedIndex = _.findIndex(user.feedAction, function(o) { return o.post == script_feed[0].id; });

        if (feedIndex != -1) {
            // User performed an action with this post
            // Check to see if there are comment-type actions.
            if (Array.isArray(user.feedAction[feedIndex].comments) && user.feedAction[feedIndex].comments) {
                // There are comment-type actions on this post.
                // For each comment on this post, add likes, flags, etc.
                for (const commentObject of user.feedAction[feedIndex].comments) {
                    if (commentObject.new_comment) {
                        // This is a new, user-made comment. Add it to the comments list for this post.
                        const cat = {
                            commentID: commentObject.new_comment_id,
                            body: commentObject.body,
                            likes: commentObject.liked ? 1 : 0,
                            unlikes: commentObject.unliked ? 1 : 0,
                            time: commentObject.relativeTime,

                            new_comment: commentObject.new_comment,
                            liked: commentObject.liked,
                            unliked: commentObject.unliked
                        };

                        if (commentObject.reply_to != null) {
                            cat.reply_to = commentObject.reply_to;
                            cat.parent_comment = commentObject.parent_comment;
                            if (replyDictionary[commentObject.parent_comment]) {
                                replyDictionary[commentObject.parent_comment].push(cat)
                            } else {
                                replyDictionary[commentObject.parent_comment] = [cat];
                            }
                        } else {
                            script_feed[0].comments.push(cat);
                        }
                    } else {
                        // This is not a new, user-created comment.
                        // Get the comment index that corresponds to the correct comment
                        const commentIndex = _.findIndex(script_feed[0].comments, function(o) { return o.id == commentObject.comment; });
                        // If this comment's ID is found in script_feed, it is a parent comment; add likes, flags, etc.
                        if (commentIndex != -1) {
                            // Check if there is a like recorded for this comment.
                            if (commentObject.liked) {
                                // Update the comment in script_feed.
                                script_feed[0].comments[commentIndex].liked = true;
                                script_feed[0].comments[commentIndex].likes++;
                            }
                            if (commentObject.unliked) {
                                // Update the comment in script_feed.
                                script_feed[0].comments[commentIndex].unliked = true;
                                script_feed[0].comments[commentIndex].unlikes++;
                            }
                            // Check if there is a flag recorded for this comment.
                            if (commentObject.flagged) {
                                script_feed[0].comments[commentIndex].flagged = true;
                            }
                        } else {
                            // Check if user conducted any actions on subcomments
                            script_feed[0].comments.forEach(function(comment, index) {
                                const subcommentIndex = _.findIndex(comment.subcomments, function(o) { return o.id == commentObject.comment; });
                                if (subcommentIndex != -1) {
                                    // Check if there is a like recorded for this subcomment.
                                    if (commentObject.liked) {
                                        // Update the comment in script_feed.
                                        script_feed[0].comments[index].subcomments[subcommentIndex].liked = true;
                                        script_feed[0].comments[index].subcomments[subcommentIndex].likes++;
                                    }
                                    if (commentObject.unliked) {
                                        // Update the subcomment in script_feed.
                                        script_feed[0].comments[index].subcomments[subcommentIndex].unliked = true;
                                        script_feed[0].comments[index].subcomments[subcommentIndex].unlikes++;
                                    }
                                    // Check if there is a flag recorded for this subcomment.
                                    if (commentObject.flagged) {
                                        script_feed[0].comments[index].subcomments[subcommentIndex].flagged = true;
                                    }
                                }
                            })
                        }
                    }
                }
            }
            script_feed[0].comments.sort(function(a, b) {
                return b.time - a.time; // in descending order.
            });

            for (const [key, value] of Object.entries(replyDictionary)) {
                const commentIndex = _.findIndex(script_feed[0].comments, function(o) { return o.commentID == key; });
                script_feed[0].comments[commentIndex]["subcomments"] =
                    script_feed[0].comments[commentIndex]["subcomments"].concat(value)
                    .sort(function(a, b) {
                        return a.time - b.time; // in descending order.
                    });
            }

            // Check if there is a like recorded for this post.
            if (user.feedAction[feedIndex].liked) {
                script_feed[0].like = true;
                script_feed[0].likes++;
            }
            // Check if there is a unlike recorded for this post. 
            if (user.feedAction[feedIndex].unliked) {
                script_feed[0].unlike = true;
                script_feed[0].unlikes++;
            }
            // Check if there is a flag recorded for this post.
            if (user.feedAction[feedIndex].flagged) {
                script_feed[0].flag = true;
            }

            finalfeed.push(script_feed[0]);
            script_feed.splice(0, 1);
        } // user did not interact with this post
        else {
            script_feed[0].comments.sort(function(a, b) {
                return b.time - a.time;
            });
            finalfeed.push(script_feed[0]);
            script_feed.splice(0, 1);
        }
    }
    finalfeed.sort(function(a, b) {
        return a.postID - b.postID;
    });

    // Convert mongoose documents to plain objects to ensure proper serialization
    // This ensures nested actors and their profiles are properly accessible in templates
    const serializedFeed = finalfeed.map(post => {
        // Use toObject with virtuals: true to include the 'id' virtual (which is _id.toString())
        const postObj = post.toObject ? post.toObject({ virtuals: true }) : post;
        // Ensure id is set (fallback to _id if id virtual didn't work)
        if (!postObj.id && postObj._id) {
            postObj.id = postObj._id.toString();
        }
        // Ensure all nested actors are properly serialized
        if (postObj.actor && postObj.actor.profile && typeof postObj.actor.profile.toObject === 'function') {
            postObj.actor.profile = postObj.actor.profile.toObject();
        }
        if (postObj.comments) {
            postObj.comments = postObj.comments.map(comment => {
                // Ensure allowInteractions is preserved (it might be lost in toObject())
                // Check the original comment from the Mongoose document if it exists
                const originalComment = post.comments && post.comments.find(c => {
                    // Compare commentID (should be numbers)
                    if (c.commentID !== undefined && comment.commentID !== undefined && 
                        c.commentID === comment.commentID) {
                        return true;
                    }
                    // Compare id - convert both to strings to handle ObjectId vs string comparison
                    if (c.id !== undefined && comment.id !== undefined) {
                        const cIdStr = c.id.toString ? c.id.toString() : String(c.id);
                        const commentIdStr = comment.id.toString ? comment.id.toString() : String(comment.id);
                        if (cIdStr === commentIdStr) {
                            return true;
                        }
                    }
                    return false;
                });
                if (originalComment && originalComment.allowInteractions !== undefined) {
                    comment.allowInteractions = originalComment.allowInteractions;
                }
                if (comment.actor && comment.actor.profile && typeof comment.actor.profile.toObject === 'function') {
                    comment.actor.profile = comment.actor.profile.toObject();
                }
                if (comment.subcomments) {
                    comment.subcomments = comment.subcomments.map(subcomment => {
                        if (subcomment.actor && subcomment.actor.profile && typeof subcomment.actor.profile.toObject === 'function') {
                            subcomment.actor.profile = subcomment.actor.profile.toObject();
                        }
                        return subcomment;
                    });
                }
                return comment;
            });
        }
        return postObj;
    });

    // Final pass: Ensure all LOL harassment comments have time set to -6:00
    // This is the last step before returning, so nothing can overwrite it
    serializedFeed.forEach((post, postIndex) => {
        if (post && post.comments && Array.isArray(post.comments)) {
            post.comments.forEach(comment => {
                // Match harassment comments by offense1 class OR removal classes (which were originally harassment)
                if (comment && comment.class === 'offense1' &&
                    comment.body && comment.body.includes("LOL, did you even preview")) {
                    setHarassmentCommentTime(comment);
                }
            });
        }
    });

    return serializedFeed;
}

/**
 * This is a helper function. It takes in a User document.
 * Function returns final feed of TUTORIAL posts (same as main feed for 3-video design).
 * Parameters: 
 *  - user: a User document
 * Returns: 
 *  - script_feed: the final feed of tutorial posts.
 */
exports.getTutorial = async function(user) {
    // For 3-video design, tutorial is the same as main feed
    return await exports.getFeed(user);
}

/**
 * Apply experimental manipulations to the 3 videos based on user's condition
 */
async function applyExperimentalManipulations(script_feed, user) {
    // Ensure we have exactly 3 videos
    if (script_feed.length !== 3) {
        return;
    }

    // Video 1: Apply experimental condition (harassment + manipulation)
    await applyManipulationToFirstVideo(script_feed[0], user);
    
    // Video 2: Buffer video (no harassment)
    // No changes needed - this is buffer content
    
    // Video 3: Buffer video (no harassment)
    // No changes needed - this is buffer content, uses CSV data as-is
}

/**
 * Apply manipulation to the first video based on user's condition
 */
async function applyManipulationToFirstVideo(firstVideo, user) {
    // Get specific actors for AI bot and human objections
    // VidShare Bot is used for AI objections and has class "objection"
    const aiBotActor = await Actor.findOne().where('username').equals("VidShare Bot").exec();
    // Human objection actors: find actors with class "objection" but exclude VidShare Bot
    const humanObjectionActors = await Actor.find()
        .where('class').equals("objection")
        .where('username').ne("VidShare Bot")
        .exec();
    
    // Harassment comment for first video (from env or fallback)
    const harassmentComment = process.env.HARASSMENT_COMMENT || "LOL, did you even preview this before sharing? No one is interested in this crap. Save your time and ours.";
    
    // Find the harassment comment index to use throughout this function
    let harassmentCommentIndex = -1;
    if (firstVideo.comments.length > 0) {
        // Try to find the existing harassment comment by class
        harassmentCommentIndex = firstVideo.comments.findIndex(comment => comment.class === 'offense1');
        
        // If not found, try to find it by body content (the harassment text)
        if (harassmentCommentIndex === -1) {
            harassmentCommentIndex = firstVideo.comments.findIndex(comment => 
                comment.body && comment.body.includes("LOL, did you even preview")
            );
        }
        
        // Only modify if we found a valid harassment comment
        if (harassmentCommentIndex !== -1) {
            const foundComment = firstVideo.comments[harassmentCommentIndex];
            // DON'T modify the body or actor - keep the original harassment comment as-is
            // Only ensure class is set correctly
            foundComment.class = 'offense1';
            foundComment.likes = 0;
            foundComment.unlikes = 0;
            // Set time to -6:00 (6 hours before user creation) to ensure it appears before objection comments (3 hours ago)
            setHarassmentCommentTime(foundComment);
            // Enable interactions for objection conditions, disable for removal conditions
            const isObjectionCondition = user.condition && (
                user.condition.startsWith('Obj:AI:') || 
                user.condition.startsWith('Obj:Com:')
            );
            foundComment.allowInteractions = isObjectionCondition;
            // Mark the comment as modified so Mongoose includes allowInteractions in toObject()
            foundComment.markModified('allowInteractions');
        }
    }
    
    // If harassment comment doesn't exist, create it
    if (harassmentCommentIndex === -1) {
        // Get a dummy actor or use the first available actor
        let harassmentActor = await Actor.findOne().exec();
        if (harassmentActor) {
            // Initialize comments array if it doesn't exist
            if (!firstVideo.comments) {
                firstVideo.comments = [];
            }
            // Enable interactions for objection conditions, disable for removal conditions
            const isObjectionCondition = user.condition && (
                user.condition.startsWith('Obj:AI:') || 
                user.condition.startsWith('Obj:Com:')
            );
            const harassmentCommentObj = {
                commentID: 999, // Use a high ID to avoid conflicts
                body: harassmentComment,
                likes: 0,
                unlikes: 0,
                actor: harassmentActor,
                time: -6 * 60 * 60 * 1000, // Will be set properly via setHarassmentCommentTime if needed
                class: 'offense1',
                allowInteractions: isObjectionCondition,
                subcomments: []
            };
            firstVideo.comments.push(harassmentCommentObj);
            harassmentCommentIndex = firstVideo.comments.length - 1;
        }
    }

    // Only apply experimental manipulations if we have a valid harassment comment
    // (or if it's Control condition which doesn't need a harassment comment)
    if (harassmentCommentIndex === -1 && user.condition !== 'Control') {
        return;
    }

    switch (user.condition) {
        case 'Control': {
            // Show the harassment comment exactly as written (no objection or removal)
            const controlComment = firstVideo.comments[harassmentCommentIndex];
            if (controlComment) {
                controlComment.body = harassmentComment;
                controlComment.class = 'offense1';
                controlComment.removed = false;
                controlComment.likes = 0;
                controlComment.unlikes = 0;
                controlComment.subcomments = [];
                controlComment.allowInteractions = true;
                setHarassmentCommentTime(controlComment);
                if (typeof controlComment.markModified === 'function') {
                    controlComment.markModified('allowInteractions');
                    controlComment.markModified('subcomments');
                    controlComment.markModified('removed');
                }
            }
            break;
        }
            
        case 'Rem:AI:NoRef':
            // AI removal message (no community reference)
            firstVideo.comments[harassmentCommentIndex].body = process.env.REMOVAL_AI_NO_REF || "This comment is removed. Our bot🤖 removed the comment for containing harassing language.";
            firstVideo.comments[harassmentCommentIndex].class = 'ai_removal_no_ref';
            firstVideo.comments[harassmentCommentIndex].removed = true;
            firstVideo.comments[harassmentCommentIndex].likes = 0;
            firstVideo.comments[harassmentCommentIndex].unlikes = 0;
            firstVideo.comments[harassmentCommentIndex].subcomments = [];
            // Ensure time is still -6:00
            setHarassmentCommentTime(firstVideo.comments[harassmentCommentIndex]);
            // Set username to [deleted] by creating a new actor object
            const originalActor1 = firstVideo.comments[harassmentCommentIndex].actor;
            setDeletedActor(firstVideo.comments[harassmentCommentIndex], originalActor1);
            break;
            
        case 'Rem:AI:Ref':
            // AI removal message (with community reference)
            firstVideo.comments[harassmentCommentIndex].body = process.env.REMOVAL_AI_REF || "This comment is removed. Our bot🤖 removed this comment for containing harassing language inconsistent with typical community behavior.";
            firstVideo.comments[harassmentCommentIndex].class = 'ai_removal_community';
            firstVideo.comments[harassmentCommentIndex].removed = true;
            firstVideo.comments[harassmentCommentIndex].likes = 0;
            firstVideo.comments[harassmentCommentIndex].unlikes = 0;
            firstVideo.comments[harassmentCommentIndex].subcomments = [];
            // Ensure time is still -6:00
            setHarassmentCommentTime(firstVideo.comments[harassmentCommentIndex]);
            // Set username to [deleted] by creating a new actor object
            const originalActor2 = firstVideo.comments[harassmentCommentIndex].actor;
            setDeletedActor(firstVideo.comments[harassmentCommentIndex], originalActor2);
            break;
            
        case 'Rem:Com:NoRef':
            // Community member removal message (no community reference)
            firstVideo.comments[harassmentCommentIndex].body = process.env.REMOVAL_COM_NO_REF || "This comment is removed. Our community member🙋 removed the comment for containing harassing language.";
            firstVideo.comments[harassmentCommentIndex].class = 'community_removal_no_ref';
            firstVideo.comments[harassmentCommentIndex].removed = true;
            firstVideo.comments[harassmentCommentIndex].likes = 0;
            firstVideo.comments[harassmentCommentIndex].unlikes = 0;
            firstVideo.comments[harassmentCommentIndex].subcomments = [];
            // Ensure time is still -6:00
            setHarassmentCommentTime(firstVideo.comments[harassmentCommentIndex]);
            // Set username to [deleted] by creating a new actor object
            const originalActor3 = firstVideo.comments[harassmentCommentIndex].actor;
            setDeletedActor(firstVideo.comments[harassmentCommentIndex], originalActor3);
            break;
            
        case 'Rem:Com:Ref':
            // Community member removal message (with community reference)
            firstVideo.comments[harassmentCommentIndex].body = process.env.REMOVAL_COM_REF || "This comment is removed. Our community member🧑 removed this comment for containing harassing language inconsistent with typical community behavior.";
            firstVideo.comments[harassmentCommentIndex].class = 'community_removal_community';
            firstVideo.comments[harassmentCommentIndex].removed = true;
            firstVideo.comments[harassmentCommentIndex].likes = 0;
            firstVideo.comments[harassmentCommentIndex].unlikes = 0;
            firstVideo.comments[harassmentCommentIndex].subcomments = [];
            // Ensure time is still -6:00
            setHarassmentCommentTime(firstVideo.comments[harassmentCommentIndex]);
            // Set username to [deleted] by creating a new actor object
            const originalActor4 = firstVideo.comments[harassmentCommentIndex].actor;
            setDeletedActor(firstVideo.comments[harassmentCommentIndex], originalActor4);
            break;
            
        case 'Obj:AI:NoRef':
            // AI objection (no community reference)
            if (aiBotActor && harassmentCommentIndex !== -1) {
                const actorForSubcomment = serializeActorForSubcomment(aiBotActor);
                // Generate a unique ObjectId for the objection subcomment so it can be tracked
                const objectionId = new mongoose.Types.ObjectId();
                const subcomment = {
                    id: objectionId, // Add id field so template can use it for commentID attribute
                    commentID: 96,
                    body: process.env.OBJECTION_AI_NO_REF || "This comment is offensive toward others. Please remember to stay respectful to each other here.",
                    likes: 0,
                    unlikes: 0,
                    actor: actorForSubcomment,
                    // Use RELATIVE time so template shows '3 hours ago'
                    time: (Date.now() - (3 * 60 * 60 * 1000)) - user.createdAt.getTime(),
                    class: 'ai_objection_no_ref',
                    new_comment: false,
                    liked: false,
                    unliked: false
                };
                firstVideo.comments[harassmentCommentIndex].subcomments.push(subcomment);
            }
            break;
            
        case 'Obj:AI:Ref':
            // AI objection (with community reference)
            if (aiBotActor && harassmentCommentIndex !== -1) {
                const actorForSubcomment = serializeActorForSubcomment(aiBotActor);
                // Generate a unique ObjectId for the objection subcomment so it can be tracked
                const objectionId = new mongoose.Types.ObjectId();
                const subcomment = {
                    id: objectionId, // Add id field so template can use it for commentID attribute
                    commentID: 96,
                    body: process.env.OBJECTION_AI_REF || "This comment is offensive toward others. This is not how people typically respond in this community.",
                    likes: 0,
                    unlikes: 0,
                    actor: actorForSubcomment,
                    // Use RELATIVE time so template shows '3 hours ago'
                    time: (Date.now() - (3 * 60 * 60 * 1000)) - user.createdAt.getTime(),
                    class: 'ai_objection_community',
                    new_comment: false,
                    liked: false,
                    unliked: false
                };
                firstVideo.comments[harassmentCommentIndex].subcomments.push(subcomment);
            }
            break;
            
        case 'Obj:Com:NoRef':
            // Human objection (no community reference)
            if (humanObjectionActors.length > 0 && harassmentCommentIndex !== -1) {
                const actorForSubcomment = serializeActorForSubcomment(humanObjectionActors[0]);
                // Generate a unique ObjectId for the objection subcomment so it can be tracked
                const mongoose = require('mongoose');
                const objectionId = new mongoose.Types.ObjectId();
                const subcomment = {
                    id: objectionId, // Add id field so template can use it for commentID attribute
                    commentID: 96,
                    body: process.env.OBJECTION_COM_NO_REF || "Please remember to stay respectful to each other here.",
                    likes: 0,
                    unlikes: 0,
                    actor: actorForSubcomment,
                    // Use RELATIVE time so template shows '3 hours ago'
                    time: (Date.now() - (3 * 60 * 60 * 1000)) - user.createdAt.getTime(),
                    class: 'human_objection_no_ref',
                    new_comment: false,
                    liked: false,
                    unliked: false
                };
                firstVideo.comments[harassmentCommentIndex].subcomments.push(subcomment);
            }
            break;
            
        case 'Obj:Com:Ref':
            // Human objection (with community reference)
            if (humanObjectionActors.length > 0 && harassmentCommentIndex !== -1) {
                const actorForSubcomment = serializeActorForSubcomment(humanObjectionActors[0]);
                // Generate a unique ObjectId for the objection subcomment so it can be tracked
                const mongoose = require('mongoose');
                const objectionId = new mongoose.Types.ObjectId();
                const subcomment = {
                    id: objectionId, // Add id field so template can use it for commentID attribute
                    commentID: 96,
                    body: process.env.OBJECTION_COM_REF || "This comment is offensive toward others. This is not how people typically respond in this community.",
                    likes: 0,
                    unlikes: 0,
                    actor: actorForSubcomment,
                    // Use RELATIVE time so template shows '3 hours ago'
                    time: (Date.now() - (3 * 60 * 60 * 1000)) - user.createdAt.getTime(),
                    class: 'human_objection_community',
                    new_comment: false,
                    liked: false,
                    unliked: false
                };
                firstVideo.comments[harassmentCommentIndex].subcomments.push(subcomment);
            }
            break;
            
        default:
            break;
    }
}

/**
 * Apply harassment to the last video (no objection for any condition)
 * Users should be able to interact with this harassment normally
 */
async function applyHarassmentToLastVideo(lastVideo, user) {
    // Harassment comment for last video (from env or fallback)
    // NOTE: This function is currently unused in the 3-video design
    const harassmentComment = process.env.HARASSMENT_COMMENT_V3 || "Seriously, how can you be so clueless about what's worth sharing? Your stuff is a total waste of space!";
    
    if (lastVideo.comments.length > 0) {
        // Try to find the existing harassment comment by class
        let harassmentCommentIndex = lastVideo.comments.findIndex(comment => comment.class === 'offense3');
        
        // If no harassment comment exists, use the first comment
        if (harassmentCommentIndex === -1) {
            harassmentCommentIndex = 0;
        }
        
        lastVideo.comments[harassmentCommentIndex].body = harassmentComment;
        lastVideo.comments[harassmentCommentIndex].class = 'offense3';
        // Harassment comments should start with 0 likes/unlikes
        lastVideo.comments[harassmentCommentIndex].likes = 0;
        lastVideo.comments[harassmentCommentIndex].unlikes = 0;
    }
}
