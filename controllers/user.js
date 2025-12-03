const User = require('../models/User');

// From https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
    let currentIndex = array.length,
        randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]
        ];
    }
    return array;
}

// create random id for guest accounts
function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * GET /logout
 * Handles user log out.
 */
exports.logout = async(req, res) => {
    const user = await User.findById(req.user.id).exec();
    const r_id = user.mturkID;
    user.logPage(Date.now(), '/thankyou');
    req.logout((err) => {
        if (err) console.log('Error : Failed to logout.', err);
        req.session.destroy((err) => {
            if (err) console.log('Error : Failed to destroy the session during logout.', err);
            req.user = null;
            res.redirect(`/thankyou?r_id=${r_id}`);
        });
    });
};

/**
 * GET /signup
 * Signup page.
 */
exports.getSignup = (req, res) => {
    // Allow users to create new accounts even if logged in (for testing different conditions)
    res.render('account/signup', {
        title: 'Create Account'
    });
};

/**
 * POST /signup
 * Create a new local account.
 */
exports.postSignup = async(req, res, next) => {
    // (1) If given r_id from Qualtrics: If user instance exists, go to profile page. If doens't exist, create a user instance. 
    // (2) If not given r_id from Qualtrics: Generate a random username, not used yet, and save user instance.
    if (req.query.r_id == 'null' || !req.query.r_id || req.query.r_id == 'undefined') {
        req.query.r_id = makeid(10);
    }

    let experimentalCondition;
    if (!req.query.c_id || req.query.c_id == 'null' || req.query.c_id == 'undefined') {
        // Randomly assign one of the 9 experimental conditions
        const conditionMessages = [
            'Control',
            'Rem:AI:NoRef', 'Rem:AI:Ref', 'Rem:Com:NoRef', 'Rem:Com:Ref',
            'Obj:AI:NoRef', 'Obj:AI:Ref', 'Obj:Com:NoRef', 'Obj:Com:Ref'
        ];
        experimentalCondition = conditionMessages[(Math.floor(Math.random() * 9))];
    } else {
        experimentalCondition = req.query.c_id;
    }

    try {
        // If user is already logged in, log them out first
        if (req.user) {
            await new Promise((resolve) => {
                req.logout((err) => {
                    if (err) {
                        console.log('Error logging out:', err);
                    }
                    resolve();
                });
            });
        }
        
        // Use r_id from query, or generate one for testing if not provided
        const r_id = req.query.r_id || `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const existingUser = await User.findOne({ mturkID: r_id }).exec();
        if (existingUser) {
            existingUser.username = req.body.username;
            existingUser.profile.picture = req.body.photo;
            existingUser.profile.name = req.body.username;
            existingUser.condition = experimentalCondition; // Update condition
            existingUser.group = experimentalCondition; // Update group
            user = existingUser;
        } else {
            user = new User({
                mturkID: r_id,
                username: req.body.username,
                profile: {
                    name: req.body.username,
                    color: '#a6a488',
                    picture: req.body.photo
                },
                condition: experimentalCondition,
                group: experimentalCondition, // Keep for backward compatibility
                active: true,
                lastNotifyVisit: (Date.now()),
                createdAt: (Date.now())
            });
        }

        await user.save();
        req.logIn(user, (err) => {
            if (err) {
                console.log('Error logging in user:', err);
                return next(err);
            }
            const currDate = Date.now();
            const userAgent = req.headers['user-agent'];
            const user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            user.logUser(currDate, userAgent, user_ip);
            res.set('Content-Type', 'application/json; charset=UTF-8');
            res.send({ result: "success" });
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /account/interest
 * Update interest information.
 */
exports.postInterestInfo = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        user.interest = req.body.interest;
        user.consent = true;
        await user.save();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /pageLog
 * Record user's page visit to pageLog.
 */
exports.postPageLog = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        user.logPage(Date.now(), req.body.path);
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /pageTimes
 * Record user's time on site to pageTimes.
 */
exports.postPageTime = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // What day in the study is the user in? 
        const log = {
            time: req.body.time,
            page: req.body.pathname,
        };
        user.pageTimes.push(log);
        await user.save();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /forgot
 * Forgot Password page.
 */
exports.getForgot = (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('account/forgot', {
        title: 'Forgot Password'
    });
};


/**
 * GET /userInfo
 * Get user profile and number of user comments
 */
exports.getUserProfile = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({
            userProfile: user.profile,
            numComments: user.numComments,
            mturkID: user.mturkID
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /qualtricsUrl
 * Get Qualtrics survey URL with r_id parameter
 */
exports.getQualtricsUrl = async(req, res) => {
    try {
        const r_id = req.query.r_id || 'unknown';
        const postSurveyUrl = process.env.POST_SURVEY || 'https://qualtrics.com/survey';
        
        // Properly format URL with query parameter separator
        // Check if URL already has query parameters
        const separator = postSurveyUrl.includes('?') ? '&' : '?';
        const qualtricsUrl = postSurveyUrl + separator + 'r_id=' + r_id;
        
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({
            url: qualtricsUrl
        });
    } catch (err) {
        res.status(500).send({ error: 'Failed to generate Qualtrics URL' });
    }
}