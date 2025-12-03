const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const User = require('./models/User.js');
const mongoose = require('mongoose');

// Console.log color shortcuts
const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red
const color_info = '\x1b[36m%s\x1b[0m'; // cyan
const color_warning = '\x1b[35m%s\x1b[0m'; // magenta

// Connect to MongoDB
const mongoUri = process.env.MONGOLAB_URI || process.env.MONGODB_URI;
if (!mongoUri) {
    console.log(color_error, 'Error: MongoDB connection string not found!');
    console.log(color_info, 'Please create a .env file with either:');
    console.log('  MONGOLAB_URI=your_connection_string');
    console.log('  or');
    console.log('  MONGODB_URI=your_connection_string');
    process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true });
const db = mongoose.connection;
db.on('error', (err) => {
    console.error(err);
    console.log(color_error, 'MongoDB connection error.');
    process.exit(1);
});

async function clearAllUsers() {
    await new Promise((resolve, reject) => {
        db.once('open', resolve);
        db.once('error', reject);
    });

    console.log(color_success, `Successfully connected to db.`);
    console.log(color_warning, `\n${'='.repeat(60)}`);
    console.log(color_warning, `⚠️  WARNING: This will delete ALL non-admin users!`);
    console.log(color_warning, `${'='.repeat(60)}\n`);

    // Count admin users (these will be preserved)
    const adminCount = await User.countDocuments({ isAdmin: true }).exec();
    console.log(color_info, `Admin users (will be preserved): ${adminCount}`);

    // Count all non-admin users
    const allNonAdminUsers = await User.find({ isAdmin: false })
        .select('username mturkID createdAt feedAction pageLog pageTimes')
        .lean()
        .exec();

    console.log(color_start, `\nFound ${allNonAdminUsers.length} non-admin users to delete.`);

    if (allNonAdminUsers.length === 0) {
        console.log(color_info, 'No users to delete. Exiting.');
        db.close();
        return;
    }

    // Calculate total behavioral data
    let totalFeedActions = 0;
    let totalPageLogs = 0;
    let totalPageTimes = 0;
    allNonAdminUsers.forEach(user => {
        if (user.feedAction) totalFeedActions += user.feedAction.length;
        if (user.pageLog) totalPageLogs += user.pageLog.length;
        if (user.pageTimes) totalPageTimes += user.pageTimes.length;
    });

    console.log(color_info, '\nBehavioral data that will be deleted:');
    console.log(`  - Feed Actions: ${totalFeedActions} entries`);
    console.log(`  - Page Logs: ${totalPageLogs} entries`);
    console.log(`  - Page Times: ${totalPageTimes} entries`);

    // Show a sample of users that will be deleted
    console.log(color_info, '\nSample of users to be deleted:');
    allNonAdminUsers.slice(0, 10).forEach(user => {
        const feedActionCount = user.feedAction ? user.feedAction.length : 0;
        console.log(`  - ${user.username || 'N/A'} (${user.mturkID || 'N/A'}) - Created: ${user.createdAt ? user.createdAt.toISOString().split('T')[0] : 'N/A'} - Feed Actions: ${feedActionCount}`);
    });
    if (allNonAdminUsers.length > 10) {
        console.log(`  ... and ${allNonAdminUsers.length - 10} more`);
    }

    // Ask for confirmation (in a real scenario, you'd use readline, but for simplicity we'll proceed)
    console.log(color_warning, '\n⚠️  Proceeding with deletion in 3 seconds...');
    console.log(color_warning, '   (Press Ctrl+C to cancel)\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete all non-admin users
    const result = await User.deleteMany({ 
        isAdmin: false
    }).exec();

    console.log(color_success, `\n✅ Successfully deleted ${result.deletedCount} users and all their behavioral data.`);
    
    // Count remaining users
    const remainingNonAdmin = await User.countDocuments({ isAdmin: false }).exec();
    const remainingAdmin = await User.countDocuments({ isAdmin: true }).exec();
    console.log(color_info, `\nRemaining users:`);
    console.log(`  - Admin users: ${remainingAdmin}`);
    console.log(`  - Non-admin users: ${remainingNonAdmin}`);

    db.close();
    console.log(color_success, '\n✓ Database connection closed.');
}

// Run the function
clearAllUsers().catch(err => {
    console.error(color_error, 'Error:', err);
    db.close();
    process.exit(1);
});

