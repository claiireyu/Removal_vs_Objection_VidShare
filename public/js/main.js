// Before Page load
let isActive = false;
let activeStartTime;

// Called when user is inactive for about 1 minute, when user logs out of the website, when user changes the page (page and video)
// Adds the amount of time use was active on the website for
function resetActiveTimer(loggingOut, fromIdle, redirectUrl) {
    if (isActive) {
        const currentTime = new Date();
        const activeDuration = currentTime - activeStartTime - (fromIdle ? 60000 : 0);
        if (window.location.pathname !== '/signup') {
            let pathname = window.location.pathname;
            if (window.location.pathname == '/' || window.location.pathname == '/tutorial') {
                const currentCard = $('.ui.fluid.card:visible');
                const index = currentCard.attr("index"); // postID (i.e. 0, 1, 2, 3, 4)
                pathname += `?v=${index}`;
            }
            $.post("/pageTimes", {
                time: activeDuration,
                pathname: pathname,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            }).then(function() {
                if (loggingOut) {
                    window.loggingOut = true;
                    $.post("/logout")
                        .then(function(data) {
                            window.location.href = redirectUrl; // go to Qualtrics
                        })
                }
            });
        }
        isActive = false;
    }
}

$(window).on("load", function() {
    //From the first answer from https://stackoverflow.com/questions/667555/how-to-detect-idle-time-in-javascript
    let idleTime = 0;
    //Definition of an active user: mouse movement, clicks etc.
    //idleTime is reset to 0 whenever mouse movement occurs.
    $('#pagegrid').on('mousemove keypress scroll mousewheel', function() {
        //If there hasn't been a "start time" for activity, set it.
        if (!isActive) {
            activeStartTime = Date.now();
            isActive = true;
        }
        idleTime = 0;
    });

    //every 15 seconds
    setInterval(function() {
        idleTime += 1;
        if (idleTime > 4) { // 60.001-74.999 seconds (idle time)
            resetActiveTimer(false, true);
        }
    }, 15000);

    $('.logoutLink').on('click', function(e) {
        $(this).addClass('loading disabled');
        e.preventDefault(); // prevent immediate naviagation to href
        resetActiveTimer(true, false, $(this).attr('href'));
    });

    if (window.location.pathname !== '/signup' && window.location.pathname !== '/' && window.location.pathname !== '/logout' && window.location.pathname !== '/thankyou') {
        $.post("/pageLog", {
            path: window.location.pathname,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        });
    };
});

$(window).on("beforeunload", function() {
    // https: //developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
    if (!window.loggingOut) {
        resetActiveTimer(false, false);
    }
});