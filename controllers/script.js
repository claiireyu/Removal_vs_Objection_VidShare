const User = require('../models/User');
const helpers = require('./helpers');
const _ = require('lodash');

/**
 * GET /tutorial
 * Get list of posts for feed (tutorial section where postFunctionalities is disabled)
 */
exports.getScriptTutorial = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // If the user is no longer active, sign the user out.
        if (!user.active) {
            req.logout((err) => {
                if (err) console.log('Error : Failed to logout.', err);
                req.session.destroy((err) => {
                    if (err) console.log('Error : Failed to destroy the session during logout.', err);
                    req.user = null;
                    req.flash('errors', { msg: 'Account is no longer active. Study is over.' });
                    res.redirect('/signup');
                });
            });
        }

        script_feed = await helpers.getTutorial(user);

        res.render('script', { script: script_feed, title: 'Feed', disabledFunctionalities: false });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /
 * Get list of posts for feed
 */
exports.getScript = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // If the user is no longer active, sign the user out.
        if (!user.active) {
            req.logout((err) => {
                if (err) console.log('Error : Failed to logout.', err);
                req.session.destroy((err) => {
                    if (err) console.log('Error : Failed to destroy the session during logout.', err);
                    req.user = null;
                    req.flash('errors', { msg: 'Account is no longer active. Study is over.' });
                    res.redirect('/signup');
                });
            });
        }

        const finalfeed = await helpers.getFeed(user);

        res.render('script', { script: finalfeed, title: 'Feed' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /feed
 * Update user's actions on ACTOR posts. 
 */
exports.postUpdateFeedAction = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        const mongoose = require('mongoose');
        const Script = require('../models/Script.js');
        let postObjectId;
        
        if (!req.body.postID) {
            console.error('postUpdateFeedAction: postID is missing in request body');
            return res.status(400).send({ result: "error", message: "postID is required" });
        }
        
        // Try to convert to ObjectId
        if (mongoose.Types.ObjectId.isValid(req.body.postID)) {
            postObjectId = new mongoose.Types.ObjectId(req.body.postID);
        } else {
            // postID is likely a numeric ID (0, 1, 2, etc.) - need to look up the actual post ObjectId
            const numericPostID = parseInt(req.body.postID);
            if (isNaN(numericPostID)) {
                console.error(`postUpdateFeedAction: Invalid postID format for user ${user.username}`);
                console.error(`  postID value: "${req.body.postID}"`);
                return res.status(400).send({ result: "error", message: "Invalid postID format" });
            }
            
            // Look up the post by numeric postID and class/interest
            const postClass = req.body.postClass || user.interest;
            const post = await Script.findOne({ 
                postID: numericPostID,
                class: postClass 
            }).select('_id').exec();
            
            if (!post) {
                console.error(`postUpdateFeedAction: Post not found for postID=${numericPostID}, class=${postClass} for user ${user.username}`);
                return res.status(404).send({ result: "error", message: "Post not found" });
            }
            
            postObjectId = post._id;
        }
        
        // Find the object from the right post in feed
        let feedIndex = _.findIndex(user.feedAction, function(o) { 
            return o.post && o.post.toString() == postObjectId.toString(); 
        });

        if (feedIndex == -1) {
            const cat = {
                post: postObjectId,
                postClass: req.body.postClass,
            };
            // Add new post into correct location
            feedIndex = user.feedAction.push(cat) - 1;
        }
        // Create a new Comment
        if (req.body.new_comment) {
            user.numComments = user.numComments + 1;
            const cat = {
                new_comment: true,
                new_comment_id: user.numComments + 100,
                body: req.body.comment_text,
                relativeTime: req.body.new_comment - user.createdAt,
                absTime: req.body.new_comment,
                videoTime: req.body.videoTime,
                liked: false,
                unliked: false,
                flagged: false,
                shared: false,
                reply_to: req.body.reply_to,
                parent_comment: req.body.parent_comment
            }
            user.feedAction[feedIndex].comments.push(cat);
        }

        // Are we doing anything with a comment?
        else if (req.body.commentID) {
            const isUserComment = (req.body.isUserComment == 'true');
            let commentIndex = (isUserComment) ?
                _.findIndex(user.feedAction[feedIndex].comments, function(o) {
                    return o.new_comment_id == req.body.commentID && o.new_comment == isUserComment
                }) :
                _.findIndex(user.feedAction[feedIndex].comments, function(o) {
                    return o.comment == req.body.commentID && o.new_comment == isUserComment
                });
            //no comment in this post-actions yet
            if (commentIndex == -1) {
                const cat = {
                    comment: req.body.commentID
                };
                user.feedAction[feedIndex].comments.push(cat);
                commentIndex = user.feedAction[feedIndex].comments.length - 1;
            }

            // LIKE A COMMENT
            if (req.body.like) {
                let like = req.body.like;
                if (user.feedAction[feedIndex].comments[commentIndex].likeTime) {
                    user.feedAction[feedIndex].comments[commentIndex].likeTime.push(like);

                } else {
                    user.feedAction[feedIndex].comments[commentIndex].likeTime = [like];
                }
                user.feedAction[feedIndex].comments[commentIndex].liked = !user.feedAction[feedIndex].comments[commentIndex].liked;
                if (req.body.isUserComment != 'true') user.numCommentLikes++;
            }

            // UNLIKE A COMMENT
            if (req.body.unlike) {
                let unlike = req.body.unlike;
                if (user.feedAction[feedIndex].comments[commentIndex].unlikeTime) {
                    user.feedAction[feedIndex].comments[commentIndex].unlikeTime.push(unlike);
                } else {
                    user.feedAction[feedIndex].comments[commentIndex].unlikeTime = [unlike];
                }
                user.feedAction[feedIndex].comments[commentIndex].unliked = !user.feedAction[feedIndex].comments[commentIndex].unliked;
                if (req.body.isUserComment != 'true') user.numCommentLikes--;
            }

            // FLAG A COMMENT
            else if (req.body.flag) {
                let flag = req.body.flag;
                if (user.feedAction[feedIndex].comments[commentIndex].flagTime) {
                    user.feedAction[feedIndex].comments[commentIndex].flagTime.push(flag);

                } else {
                    user.feedAction[feedIndex].comments[commentIndex].flagTime = [flag];
                }
                user.feedAction[feedIndex].comments[commentIndex].flagged = true;
            }

            // UNFLAG A COMMENT
            else if (req.body.unflag) {
                let unflag = req.body.unflag;
                if (user.feedAction[feedIndex].comments[commentIndex].flagTime) {
                    user.feedAction[feedIndex].comments[commentIndex].flagTime.push(unflag);

                } else {
                    user.feedAction[feedIndex].comments[commentIndex].flagTime = [unflag];
                }
                user.feedAction[feedIndex].comments[commentIndex].flagged = false;
            }

            // SHARE A COMMENT 
            else if (req.body.share) {
                let share = req.body.share;
                if (user.feedAction[feedIndex].comments[commentIndex].shareTime) {
                    user.feedAction[feedIndex].comments[commentIndex].shareTime.push(share);

                } else {
                    user.feedAction[feedIndex].comments[commentIndex].shareTime = [share];
                }
                user.feedAction[feedIndex].comments[commentIndex].shared = true;
            }
        } // Not a comment-- Are we doing anything with the post?
        else {
            // Flag event
            if (req.body.flag) {
                let flag = req.body.flag;
                if (!user.feedAction[feedIndex].flagTime) {
                    user.feedAction[feedIndex].flagTime = [flag];
                } else {
                    user.feedAction[feedIndex].flagTime.push(flag);
                }
                user.feedAction[feedIndex].flagged = !user.feedAction[feedIndex].flagged;
            } // Like event
            else if (req.body.like) {
                let like = req.body.like;
                if (!user.feedAction[feedIndex].likeTime) {
                    user.feedAction[feedIndex].likeTime = [like];
                } else {
                    user.feedAction[feedIndex].likeTime.push(like);
                }
                user.feedAction[feedIndex].liked = !user.feedAction[feedIndex].liked;
            } // Unlike event
            else if (req.body.unlike) {
                let unlike = req.body.unlike;
                if (!user.feedAction[feedIndex].unlikeTime) {
                    user.feedAction[feedIndex].unlikeTime = [unlike];
                } else {
                    user.feedAction[feedIndex].unlikeTime.push(unlike);
                }
                user.feedAction[feedIndex].unliked = !user.feedAction[feedIndex].unliked;
            } // Share event 
            else if (req.body.share) {
                let share = req.body.share;
                if (!user.feedAction[feedIndex].shareTime) {
                    user.feedAction[feedIndex].shareTime = [share];
                } else {
                    user.feedAction[feedIndex].shareTime.push(share);
                }
                user.feedAction[feedIndex].shared = true;
            } // Read event: Not used.
            else if (req.body.viewed) {
                let view = req.body.viewed;
                if (!user.feedAction[feedIndex].readTime) {
                    user.feedAction[feedIndex].readTime = [view];
                } else {
                    user.feedAction[feedIndex].readTime.push(view);
                }
                user.feedAction[feedIndex].rereadTimes++;
                user.feedAction[feedIndex].mostRecentTime = Date.now();
            } // Video action (play, pause, seeking, seeked) 
            else if (req.body.videoAction) {
                user.feedAction[feedIndex].videoAction.push(req.body.videoAction);
            } // Video duration (array of time durations user viewed the video) 
            else if (req.body.videoDuration) {
                user.feedAction[feedIndex].videoDuration.push(req.body.videoDuration);
            }
        }
        await user.save();
        res.send({ result: "success", numComments: user.numComments });
    } catch (err) {
        next(err);
    }

};