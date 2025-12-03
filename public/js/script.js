let seenMessages = {};
let seenVideos = []; // List of videos the user has already visited. Used to determine if the 'Next Video' button should be disabled or not.
let timeout;

function videoGeneralListener(event) {
    const eventType = event.type;
    const post = $(this).parents(".ui.fluid.card");
    const postID = post.attr("postID");

    let videoAction = {
        action: eventType,
        absTime: Date.now(),
    };
    if (eventType != "ended") {
        videoAction.videoTime = this.currentTime;
    }
    if (eventType == "volumechange") {
        videoAction.volume = (this.muted) ? 0 : this.volume;
    }
    $.post("/feed", {
        postID: postID,
        videoAction: videoAction,
        _csrf: $("meta[name='csrf-token']").attr("content")
    })
}

function videoPauseListener(event) {
    // When a user switches to another video while it is still playing, the "pause" is triggered programatically by .trigger("pause").
    // But for some reason, programatically triggering the pause calls the .on("pause") event handler twice. 
    // So, ignore one of these triggers.
    if (event.isTrigger) {
        return;
    }

    const post = $(this).parents(".ui.fluid.card");
    const postID = post.attr("postID");
    if (!this.seeking) {
        $.post("/feed", {
            postID: postID,
            videoAction: {
                action: "pause",
                absTime: Date.now(),
                videoTime: this.currentTime,
            },
            _csrf: $("meta[name='csrf-token']").attr("content")
        });
    }

    const videoElement = post.find("video")[0];
    const videoDuration = [];
    for (let i = 0; i < videoElement.played.length; i++) {
        videoDuration.push({
            startTime: videoElement.played.start(i),
            endTime: videoElement.played.end(i)
        });
    }

    if (videoDuration.length != 0) {
        $.post("/feed", {
            postID: postID,
            videoDuration: videoDuration,
            _csrf: $("meta[name='csrf-token']").attr("content")
        });
    }
}

// JavaScript that handles functionalities related to script (newsfeed) videos 
$(window).on("load", function() {
    $(".right-button ").popup(); // Enables tooltip
    $(".lastVid-button").popup();

    const numVideos = $("video").length;
    const firstVideoIndex = parseInt($(`.ui.fluid.card:visible`).attr("index"));

    seenVideos.push(firstVideoIndex);
    timeout = setTimeout(function() {
        $(".right-button").popup('hide');
        $(".right-button").attr("data-html", "Next Video");
        $("button.right").removeClass('disabled');
    }, 20000);

    $.post("/pageLog", {
        path: window.location.pathname + `?v=${$(".ui.fluid.card:visible").attr("index")}`,
        _csrf: $("meta[name='csrf-token']").attr("content")
    });

    $("video").on("play seeked seeking volumechange ended", videoGeneralListener);

    $("video").on("pause", videoPauseListener);

    // Buttons to switch videos
    let isTransitioning = false; // For debouncing to limit the frequency of click events
    $("button.circular.ui.icon.button.blue.centered").on("click", async function() {
        if (isTransitioning) return; // Exit early if a transition is already in progress
        isTransitioning = true; // Set transitioning flag
        clearTimeout(timeout);

        const currentCard = $(".ui.fluid.card:visible");
        // If current video is not paused, pause video.
        if (!currentCard.find("video")[0].paused) {
            currentCard.find("video").trigger("pause");
        }
        // Record the time spent on current video "page".
        resetActiveTimer(false, false); // Logs time spent on current video before transitioning

        // Transition to next video and play the video.
        const nextVid = parseInt($(this).attr("nextVid"));
        const index = nextVid - firstVideoIndex;
        $(".ui.fluid.card:visible").transition("hide");
        $(`.ui.fluid.card[index=${nextVid}]`).transition();

        // Hide buttons accordingly and change button nextVid attribute
        // Left Button
        if (index % numVideos == 0) {
            $("button.left").addClass("hidden");
        } else {
            $("button.left").removeClass("hidden");
            $("button.left").attr("nextVid", nextVid - 1);
        }

        // Right Button & "Continue" button
        // If this is the last video
        if (index % numVideos == numVideos - 1) {
            $(".right-button").attr("data-html", "This is the last video.</br>Click 'Finish Study' to complete the study.");
            $("button.right").addClass('disabled');
            $(".lastVid-button").removeClass("hidden");
            $(".lastVid-button").popup();
            // The user has not watched the last video
            if (!seenVideos.includes(nextVid)) {
                timeout = setTimeout(function() {
                    seenVideos.push(nextVid);
                    $(".lastVid-button").popup('hide');
                    $(".lastVid-button").removeAttr("data-html");
                    $(".lastVid-button").removeAttr("data-position");
                    $(".lastVid-button .button").removeClass('disabled');
                }, 20000);
            } else {
                $(".lastVid-button .button").removeClass('disabled');
            }
        } // Else this is not the last video
        else {
            // If the user hasn't seen the video before
            if (!seenVideos.includes(nextVid)) {
                $(".right-button").attr("data-html", "Please wait to proceed to the next video.");
                $("button.right").addClass('disabled');
                timeout = setTimeout(function() {
                    seenVideos.push(nextVid);
                    $(".right-button").popup('hide');
                    $(".right-button").attr("data-html", "Next Video");
                    $("button.right").removeClass('disabled');
                }, 20000);
            } else {
                $(".right-button").attr("data-html", "Next Video");
                $("button.right").removeClass("disabled");
            }
            $("button.right").attr("nextVid", nextVid + 1);
            $(".lastVid-button").addClass("hidden");
        }

        // Log new page
        await $.post("/pageLog", {
            path: window.location.pathname + `?v=${nextVid}`,
            _csrf: $("meta[name='csrf-token']").attr("content")
        });

        // After all operations are completed, reset the transitioning flag
        isTransitioning = false;
    });

    // Buttons to next page
    $(".lastVid-button .ui.large.button.green").on("click", function() {
        $(this).addClass("loading disabled");
        const currentCard = $(".ui.fluid.card:visible");
        // If current video is not paused, pause video.
        if (!currentCard.find("video")[0].paused) {
            currentCard.find("video").trigger("pause");
        }
        // For 3-video study, always go to thank you page with Qualtrics link
        // Get r_id from user session via AJAX call
        $.get("/userProfile", function(data) {
            const r_id = data.mturkID || data.userProfile?.mturkID || 'unknown';
            // Direct redirect to thank you page - bypass any other redirects
            window.location.replace("/thankyou?r_id=" + r_id);
        }).fail(function() {
            // Fallback if userProfile fails
            window.location.replace("/thankyou?r_id=unknown");
        });
    })
});