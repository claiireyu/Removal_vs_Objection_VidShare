const bcrypt = require('@node-rs/bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
    username: String,
    active: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },

    numComments: { type: Number, default: -1 }, // # of comments on posts (actor), it is used for indexing and commentID of user comments on posts (actor)

    createdAt: Date, // Absolute Time user was created
    consent: { type: Boolean, default: false }, //Indicates if user has proceeded through welcome signup pages

    mturkID: { type: String, unique: true },

    condition: String, // Experimental condition: Control, AI_Removal_NoRef, AI_Removal_Community, Human_Objection_NoRef, Human_Objection_Community

    group: String, // [frequency of harassing comments]:[frequency of addressed harassment comments] - DEPRECATED
    harassmentOrder: [Number], // Values correspond to which harassment comment. Order of list indicates the order in which they appear. - DEPRECATED
    harassmentToObjectToOrder: [Number], // Values correspond to which harassment comment objection belongs to. - DEPRECATED
    objectionOrder: [Number], // Values correspond to which objection comment. - DEPRECATED 

    commentTimes: [], // Lists of arrays of comment times for each video in the tutorial section.
    subcommentTimes: [], // List of subcomment times (6 values for objection comments, corresponding to their order of replacement; 1 value for first video, first comment's subcomment)

    interest: String, //'Science', 'Lifestyle', 'Education'

    log: [new Schema({ //Logins
        time: Date,
        userAgent: String,
        ipAddress: String
    })],

    pageLog: [new Schema({ //Page visits
        time: Date,
        page: String //URL
    })],

    pageTimes: [new Schema({ //how much time the user spent on a page
        //values are added when page (page or video) changes, when user is inactive for 1 minute, or when user logs out
        time: Number, //in millliseconds
        page: String //URL
    })],

    feedAction: [new Schema({
        post: { type: Schema.ObjectId, ref: 'Script' },

        liked: { type: Boolean, default: false }, //has the user liked it?
        unliked: { type: Boolean, default: false }, //has the user disliked it?
        flagged: { type: Boolean, default: false }, // has the user flagged it?
        shared: { type: Boolean, default: false }, //has the user shared it?
        likeTime: [Date], //absoluteTimes of times user has liked the post
        unlikeTime: [Date], //absoluteTimes of times user has unliked the post
        flagTime: [Date], //absoluteTimes of times user has flagged the post
        shareTime: [Date], //absoluteTimes of times user has shared the post
        // readTime: [Number], //in milliseconds, how long the user spent looking at the post (we do not record times less than 1.5 seconds and more than 24 hrs)

        videoAction: [{
            action: String, //Type of action (play, pause, seeking, seeked, volumeChange, ended) https: //developer.mozilla.org/en-US/docs/Web/HTML/Element/video#events
            absTime: Date, //Exact time action was taken
            videoTime: Number, //in milliseconds (play: time in video they clicked play, pause: time in video they clicked pause, seeking + seeked: time in video they seeked to)
            volume: Number //number from 0-1, indicating new volume.
        }],

        videoDuration: [
            [{
                startTime: Number,
                endTime: Number
            }]
        ],

        comments: [new Schema({
            comment: { type: Schema.ObjectId }, //ID Reference for Script post comment
            liked: { type: Boolean, default: false }, //has the user liked it?
            unliked: { type: Boolean, default: false }, //has the user unliked it?
            flagged: { type: Boolean, default: false }, //has the user flagged it?
            shared: { type: Boolean, default: false }, //has the user shared it?
            likeTime: [Date], //absoluteTimes of times user has liked the comment
            unlikeTime: [Date], //absoluteTimes of times user has unliked the comment
            flagTime: [Date], //absoluteTimes of times user has flagged the comment
            shareTime: [Date], //absoluteTimes of times user has shared the comment
            new_comment: { type: Boolean, default: false }, //is this a comment from user?
            new_comment_id: Number, //ID for comment, begins at 100
            reply_to: Number, // CommentID/index if comment is a reply
            parent_comment: Number, //CommentID/index of parent comment (used for identifying subcommenting)
            body: String, //Body of comment
            absTime: Date, //Exact time comment was made
            relativeTime: Number, //in milliseconds, relative time comment was made to when the user created their account
            videoTime: Number, //in milliseconds, for new comments, indicates when comment was made
        }, { _id: true, versionKey: false })]
    }, { _id: true, versionKey: false })],

    profile: {
        name: String,
        location: String,
        bio: String,
        color: String,
        picture: String
    }
}, { timestamps: true, versionKey: false });

/**
 * Add login instance to user.log
 */
userSchema.methods.logUser = async function logUser(time, agent, ip) {
    try {
        this.log.push({
            time: time,
            userAgent: agent,
            ipAddress: ip
        });
        await this.save();
    } catch (err) {
        console.log(err);
    }
};

/**
 * Add page visit instance to user.pageLog
 */
userSchema.methods.logPage = async function logPage(time, page) {
    try {
        this.pageLog.push({
            time: time,
            page: page
        });
        await this.save();
    } catch (err) {
        console.log(err);
    }
};

const User = mongoose.model('User', userSchema);
module.exports = User;