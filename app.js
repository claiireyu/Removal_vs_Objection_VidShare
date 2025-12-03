/**
 * Module dependencies.
 */
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const dotenv = require('dotenv');
const MongoStore = require('connect-mongo');
const flash = require('express-flash');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const schedule = require('node-schedule');
const fs = require('fs');
const util = require('util');
fs.readFileAsync = util.promisify(fs.readFile);

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({ path: '.env' });

/**
 * Controllers (route handlers).
 */
const actorsController = require('./controllers/actors');
const scriptController = require('./controllers/script');
const userController = require('./controllers/user');

/**
 * API keys and Passport configuration.
 */
const passportConfig = require('./config/passport');

/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to MongoDB.
 */
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('error', (err) => {
    console.error(err);
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.');
    process.exit();
});

/**
 * Express configuration.
 */
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
//app.use(expressStatusMonitor());
app.use(compression());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: process.env.SESSION_SECRET,
    cookie: {
        path: '/',
        httpOnly: true,
        secure: false,
        maxAge: 86400000 //24 hours
    },
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
    res.locals.user = req.user;
    // Set cdn to empty string for local development, or use environment variable for production
    res.locals.cdn = process.env.CDN || '';
    next();
});

app.use((req, res, next) => {
    // If a user attempts to access a site page that requires logging in, but they are not logged in, then record the page they desired to visit.
    // After successfully logging in, redirect the user back to their desired page.
    if (!req.user &&
        req.path !== '/login' &&
        req.path !== '/signup' &&
        req.path !== '/pageLog' &&
        req.path !== '/pageTimes' &&
        req.path !== '/notifications' &&
        !req.path.match(/\./)) {
        req.session.returnTo = req.originalUrl;
    }
    next();
});

app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use('/semantic', express.static(path.join(__dirname, 'semantic'), { maxAge: 31557600000 }));
app.use(express.static(path.join(__dirname, 'uploads'), { maxAge: 31557600000 }));
app.use('/post_pictures', express.static(path.join(__dirname, 'post_pictures'), { maxAge: 31557600000 }));
app.use('/profile_pictures', express.static(path.join(__dirname, 'profile_pictures'), { maxAge: 31557600000 }));

/**
 * Primary app routes.
 */
app.post('/pageLog', passportConfig.isAuthenticated, userController.postPageLog);
app.post('/pageTimes', passportConfig.isAuthenticated, userController.postPageTime);

app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);
app.get('/account/interest', passportConfig.isAuthenticated, async function(req, res) {
    const data = await fs.readFileAsync(`${__dirname}/public/json/interestData.json`)
    const interestData = JSON.parse(data.toString());

    res.render('account/interest', {
        title: 'Choose your Interest',
        interestData
    });
});
app.post('/account/interest', passportConfig.isAuthenticated, userController.postInterestInfo);
app.get('/logout', userController.logout);

app.get('/', passportConfig.isAuthenticated, scriptController.getScript);
app.post('/feed', passportConfig.isAuthenticated, scriptController.postUpdateFeedAction);
app.get('/tutorial', passportConfig.isAuthenticated, scriptController.getScriptTutorial);
app.get('/trans', passportConfig.isAuthenticated, function(req, res) {
    const redirectId = req.user?.mturkID || 'unknown';
    return res.redirect(`/thankyou?r_id=${redirectId}`);
});
app.get('/thankyou', function(req, res) {
    res.render('thankyou', {
        title: 'Thank you!',
        r_id: req.query.r_id
    })
});

app.get('/actors', actorsController.getActors);
app.get('/userProfile', userController.getUserProfile);
app.get('/qualtricsUrl', userController.getQualtricsUrl);

/**
 * Error Handler.
 */
app.use(function(err, req, res, next) {
    // No routes handled the request and no system error, that means 404 issue.
    // Forward to next middleware to handle it.
    if (!err) return next();

    console.error(err);

    // set locals, only providing error stack and message in development
    // Express app.get('env') returns 'development' if NODE_ENV is not defined
    err.status = err.status || 500;
    err.stack = req.app.get('env') === 'development' ? err.stack : '';
    err.message = req.app.get('env') === 'development' ? err.message : " Oops! Something went wrong.";

    res.locals.message = err.message;
    res.locals.error = err;

    // render the error page
    res.status(err.status);
    res.render('error');
});

// catch 404. 404 should be considered as a default behavior, not a system error.
// Necessary to include because in express, 404 responses are not the result of an error, so the error-handler middleware will not capture them. https://expressjs.com/en/starter/faq.html 
app.use(function(req, res, next) {
    var err = new Error('Page Not Found.');
    err.status = 404;

    console.log(err);

    // set locals, only providing error stack in development
    err.stack = req.app.get('env') === 'development' ? err.stack : '';

    res.locals.message = err.message + " Oops! We can't seem to find the page you're looking for.";
    res.locals.error = err;

    // render the error page
    res.status(err.status);
    res.render('error');
});

/**
 * Start Express server.
 */
app.listen(app.get('port'), () => {
    console.log(`App is running on http://localhost:${app.get('port')} in ${app.get('env')} mode.`);
    console.log('  Press CTRL-C to stop\n');
});
module.exports = app;