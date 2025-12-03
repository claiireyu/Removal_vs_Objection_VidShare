async function getUserInformation() {
    const data = await $.get("/userProfile");
    script.userProfile = data.userProfile;
    script.numComments = data.numComments;
}

getUserInformation();

function likePost(e) {
    const target = $(e.target).closest('.ui.like.button');
    const post = target.closest(".ui.fluid.card");
    const label = post.find("a.ui.basic.green.right.pointing.label");
    const postID = post.attr("postID");
    const postClass = post.attr("postClass");
    const like = Date.now();

    if (target.hasClass("green")) { //Undo like Post
        target.removeClass("green");
        label.html(function(i, val) { return val * 1 - 1 });
    } else { //Like Post
        target.addClass("green");
        label.html(function(i, val) { return val * 1 + 1 });

        let dislike = post.find('.ui.unlike.button');
        if (dislike.hasClass("red")) {
            dislike.removeClass("red");
            var label2 = dislike.siblings("a.ui.basic.red.left.pointing.label");
            label2.html(function(i, val) { return val * 1 - 1 });
            $.post("/feed", {
                postID: postID,
                unlike: like,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        }
    }
    $.post("/feed", {
        postID: postID,
        like: like,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function unlikePost(e) {
    const target = $(e.target).closest('.ui.unlike.button');
    const post = target.closest(".ui.fluid.card");
    const label = post.find("a.ui.basic.red.left.pointing.label");
    const postID = post.attr("postID");
    const postClass = post.attr("postClass");
    const unlike = Date.now();

    if (target.hasClass("red")) { //Undo unlike Post
        target.removeClass("red");
        label.html(function(i, val) { return val * 1 - 1 });
    } else { //Like Post
        target.addClass("red");
        label.html(function(i, val) { return val * 1 + 1 });

        let like = post.find('.ui.like.button');
        if (like.hasClass("green")) {
            like.removeClass("green");
            var label2 = like.siblings("a.ui.basic.green.right.pointing.label");
            label2.html(function(i, val) { return val * 1 - 1 });
            $.post("/feed", {
                postID: postID,
                like: unlike,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        }
    }

    $.post("/feed", {
        postID: postID,
        unlike: unlike,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function flagPost(e) {
    const target = $(e.target).closest('.ui.flag.button');
    const post = target.closest(".ui.fluid.card");
    const postID = post.attr("postID");
    const postClass = post.attr("postClass");
    const flag = Date.now();

    if (target.hasClass("orange")) { //Undo Flag Post
        target.removeClass("orange");
    } else { //Flag Post
        target.addClass("orange");
    }

    $.post("/feed", {
        postID: postID,
        flag: flag,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function sharePost(e) {
    const target = $(e.target);
    const post = target.closest(".ui.fluid.card");
    const postID = post.attr("postID");
    const postClass = post.attr("postClass");
    const share = Date.now();

    const pathname = window.location.href;
    $(".pathname").html(pathname + "?postID=" + postID);
    $('.ui.small.shareVideo.modal').modal('show');

    $.post("/feed", {
        postID: postID,
        share: share,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

/**
 * Check if interactions are allowed on a comment
 * Returns false if interactions should be disabled, true otherwise
 */
function canInteractWithComment(commentElement) {
    const commentClass = commentElement.attr("class");
    
    // Check if this is a removed comment - disable all interactions
    if (commentClass && commentClass.includes('removal')) {
        return false;
    }
    
    // Check if this is a harassment comment (except offense3)
    // For objection conditions, allow interactions (comment has allowInteractions attribute)
    // For removal/control conditions, disable upvote/downvote
    if (commentClass && commentClass.includes('offense') && !commentClass.includes('offense3')) {
        const allowInteractions = commentElement.attr("data-allow-interactions") === "true";
        if (!allowInteractions) {
            return false; // Disable if not explicitly allowed
        }
    }
    
    // Objection comments and offense3 (third video harassment) should allow full interactions
    return true;
}

function likeComment(e) {
    const target = $(e.target).closest('a.like'); //a.like
    const comment = target.closest(".comment");
    const label = target.find("span.num");
    const icon = target.find("i.icon.thumbs.up");

    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.children(".content").children("a.author").hasClass('/me');
    const like = Date.now();

    // Check if interactions are allowed on this comment
    if (!canInteractWithComment(comment)) {
        return;
    }

    if (target.hasClass("green")) { //Undo like comment
        target.removeClass("green");
        icon.removeClass("green");
        label.html(function(i, val) { return val * 1 - 1 });
    } else { //Like comment
        target.addClass("green");
        icon.addClass("green");
        label.html(function(i, val) { return val * 1 + 1 });

        let dislike = target.siblings("a.unlike");
        if (dislike.hasClass("red")) {
            dislike.removeClass("red");
            var label2 = dislike.find("span.num");
            var icon2 = dislike.find("i.icon.thumbs.down");
            label2.html(function(i, val) { return val * 1 - 1 });
            icon2.removeClass("red");
            $.post("/feed", {
                postID: postID,
                commentID: commentID,
                unlike: like,
                isUserComment: isUserComment,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        }
    }
    $.post("/feed", {
        postID: postID,
        commentID: commentID,
        like: like,
        isUserComment: isUserComment,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function unlikeComment(e) {
    const target = $(e.target).closest('a.unlike'); //a.unlike
    const comment = target.closest(".comment");
    const label = target.find("span.num");
    const icon = target.find("i.icon.thumbs.down");

    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.children(".content").children("a.author").hasClass('/me');
    const unlike = Date.now();

    // Check if interactions are allowed on this comment
    if (!canInteractWithComment(comment)) {
        return;
    }

    if (target.hasClass("red")) { //Undo unlike comment
        target.removeClass("red");
        icon.removeClass("red");
        label.html(function(i, val) { return val * 1 - 1 });
    } else { //unlike comment
        target.addClass("red");
        icon.addClass("red");
        label.html(function(i, val) { return val * 1 + 1 });

        let like = target.siblings("a.like");
        if (like.hasClass("green")) {
            like.removeClass("green");
            var label2 = like.find("span.num");
            var icon2 = like.find("i.icon.thumbs.up");
            label2.html(function(i, val) { return val * 1 - 1 });
            icon2.removeClass("green");
            $.post("/feed", {
                postID: postID,
                commentID: commentID,
                like: unlike,
                isUserComment: isUserComment,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        }
    }
    $.post("/feed", {
        postID: postID,
        commentID: commentID,
        unlike: unlike,
        isUserComment: isUserComment,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function flagComment(e) {
    const target = $(e.target);
    const comment = target.closest(".comment");
    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.children(".content").children("a.author").hasClass('/me');
    const commentClass = comment.attr("class");

    // Check if this is a removed comment - disable flagging
    if (commentClass && commentClass.includes('removal')) {
        return;
    }

    const comment_imageElement = comment.children('.image');
    const comment_contentElement = comment.children('.content');
    const flaggedComment_contentElement = comment.children('.content.hidden');

    comment_imageElement.transition('hide');
    comment_contentElement.transition('hide');
    $(flaggedComment_contentElement).transition();
    const flag = Date.now();

    $.post("/feed", {
        postID: postID,
        commentID: commentID,
        flag: flag,
        isUserComment: isUserComment,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function unflagComment(e) {
    const target = $(e.target);
    const comment = target.closest(".comment");
    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.children(".content").children("a.author").hasClass('/me');

    const comment_imageElement = comment.children('.image.hidden');
    const comment_contentElement = comment.children('.content.hidden');
    const flaggedComment_contentElement = comment.children('.content:not(.hidden)');

    $(flaggedComment_contentElement).transition('hide');
    comment_imageElement.transition();
    comment_contentElement.transition();

    const unflag = Date.now();

    $.post("/feed", {
        postID: postID,
        commentID: commentID,
        unflag: unflag,
        isUserComment: isUserComment,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function shareComment(e) {
    const target = $(e.target);
    const comment = target.closest(".comment");
    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.children(".content").children("a.author").hasClass('/me');
    const share = Date.now();

    const pathname = window.location.href;
    $(".pathname").html(pathname + "?commentID=" + postID);
    $('.ui.small.shareComment.modal').modal('show');

    $.post("/feed", {
        postID: postID,
        commentID: commentID,
        share: share,
        isUserComment: isUserComment,
        postClass: postClass,
        _csrf: $('meta[name="csrf-token"]').attr('content')
    });
}

function addCommentToVideo(e) {
    const target = $(e.target);
    const form = target.parents(".ui.form");
    const text = form.find("textarea.replyToVideo").val().trim();
    const card = target.parents(".ui.fluid.card");
    let comments = card.find(".ui.comments");
    const postClass = target.parents(".ui.fluid.card").attr("postClass");
    if (text.trim() !== '') {
        const videoTime = card.find("video")[0].currentTime * 1000;
        const date = Date.now();
        const postID = card.attr("postID");
        const commentID = script.numComments + 1 + 100;

        const mess = `
        <div class="comment" commentID=${commentID} index=${commentID}>
            <div class="image" style="background-color:${script.userProfile.color}">
                <a class="avatar"><img src="${script.userProfile.picture}"></a>
            </div>
            <div class="content"> 
                <a class="author /me">${script.userProfile.name} (me)</a>
                <div class="metadata"> 
                    <span class="date">Just now</span>
                </div> 
                <div class="text">${text}</div>
                <div class="actions"> 
                    <a class="like" onClick="likeComment(event)">
                        <i class="icon thumbs up"></i>
                        <span class="num">0</span>
                    </a>
                    <a class="unlike" onClick="unlikeComment(event)">
                        <i class="icon thumbs down"></i>
                        <span class="num">0</span>
                    </a>
                    <a class="reply" onClick="openCommentReply(event)">Reply</a>                                  
                </div> 
            </div>
        </div>`;
        form.find("textarea.replyToVideo").val('');
        form.find("textarea.replyToVideo").blur();
        const lastVisibleComment = comments.children('.comment:not(.hidden)').first()[0];
        if (!lastVisibleComment) { //There are no comments visible
            comments.append(mess);
        } else { // There are some comments visible.
            lastVisibleComment.insertAdjacentHTML("beforebegin", mess);
        }
        $(`.comment[commentID=${commentID}]`).last()[0].scrollIntoView({ block: 'center', behavior: 'smooth' });

        $.post("/feed", {
            postID: postID,
            new_comment: date,
            videoTime: videoTime,
            comment_text: text,
            postClass: postClass,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        }).then(function(json) {
            script.numComments = json.numComments;
        });
    }
}

function changeColor(e, string = "") {
    let target = $(e.target);
    if (target.val().trim() !== string) {
        target.parents(".ui.form").children('.ui.submit.button').addClass("blue");
    } else {
        target.parents(".ui.form").children('.ui.submit.button').removeClass("blue");
    }
}

function openCommentReply(e) {
    // Check if this is a disabled reply button (for removed comments)
    if ($(e.target).hasClass('disabled')) {
        return false; // Don't allow replies to removed comments
    }
    
    const photo = script.userProfile.picture;
    const color = script.userProfile.color;
    const target = $(e.target).parents('.content');
    const reply_to = target.children('a.author').text().replace(" (me)", "");
    const form = target.children('.ui.form');
    if (form.length !== 0) {
        form.hide(function() { $(this).remove(); });
        target[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
        const comment_level = target.parents(".comment").length;
        const comment_area = (
            `<div class="ui form">
                <div class="inline field">
                    <div class="image" style="background-color:${color}">
                        <img class="ui image rounded" src=${photo}>
                    </div>
                    <textarea class="replyToComment" type="text" placeholder="Add a Reply..." rows="1" onInput="changeColor(event${", '@"+reply_to +"'"})">${"@"+reply_to+" "}</textarea>
                </div>
                <div class="ui submit button replyToComment" onClick="addCommentToComment(event)">
                    Reply to ${reply_to}
                </div>
                <div class="ui cancel basic blue button replyToComment" onClick="openCommentReply(event)">
                    Cancel
                </div>
            </div>
            </div>`
        );
        $(comment_area).insertAfter(target.children('.actions')).hide().show(400);
        const comment_area_element = $(target).find('textarea.replyToComment');
        const end = comment_area_element.val().length;
        comment_area_element[0].setSelectionRange(end, end);
        // if (comment_level == 2) {
        comment_area_element.highlightWithinTextarea({
                highlight: [{
                    highlight: "@" + reply_to, // string, regexp, array, function, or custom object
                    className: 'blue'
                }]
            })
            // };
        comment_area_element.focus();
        comment_area_element[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

function addCommentToComment(e) {
    const target = $(e.target);
    const form = target.parents(".ui.form");
    if (!form.children(".ui.submit.button").hasClass("blue")) {
        return;
    }
    let text = form.find("textarea.replyToComment").val();
    const orig_comment = form.closest(".comment");
    const comment_level = form.parents(".comment").length; // = 1 if 1st level, = 2 if 2nd level
    if (comment_level == 1) {
        if (!orig_comment.children('.comments').length) {
            orig_comment.append('<div class="comments subcomments">');
        }
        comments = orig_comment.find(".comments");
    } else {
        comments = orig_comment.closest(".comments");
    }
    if (text.trim() !== "") {
        const words = form.find("mark").map(function() {
            return $(this).html();
        })
        const highlights = [...new Set(words)].sort(function(a, b) {
            return b.length - a.length; // Desc order
        });
        if (highlights.length !== 0) {
            for (word of highlights) {
                var regEx = new RegExp('(?<!<a>)' + word, 'gmi');
                text = text.replace(regEx, '<a>' + word + '</a>')
            }
        }

        const card = target.parents(".ui.fluid.card");
        const videoTime = card.find("video")[0].currentTime * 1000;
        const date = Date.now();
        const postID = card.attr("postID");
        const postClass = card.attr("postClass");
        const commentID = script.numComments + 1 + 100;
        const reply_to = orig_comment.children(".content").children("a.author").hasClass('/me') ? orig_comment.attr('commentID') : orig_comment.attr('index');
        const parent_comment = form.parents(".comment").last().attr('index');

        const mess =
            `<div class="comment" commentID=${commentID}>
            <div class="image" style="background-color:${script.userProfile.color}">
                <a class="avatar"><img src="${script.userProfile.picture}"></a>
            </div>
            <div class="content"> 
                <a class="author /me">${script.userProfile.name} (me)</a>
                <div class="metadata"> 
                    <span class="date">Just now</span>
                </div> 
                <div class="text">${text}</div>
                <div class="actions"> 
                    <a class="like" onClick="likeComment(event)">
                        <i class="icon thumbs up"></i>
                        <span class="num">0</span>
                    </a>
                    <a class="unlike" onClick="unlikeComment(event)">
                        <i class="icon thumbs down"></i>
                        <span class="num">0</span>
                    </a>
                    <a class="reply" onClick="openCommentReply(event)">Reply</a>                                       
                </div> 
            </div>
        </div>`;

        form.find("textarea.newComment").val("");
        form.remove();

        if (!comments.is(":visible")) {
            comments.transition('fade');
        }
        // comments.append(mess);
        const lastVisibleComment = comments.children('.comment:not(.hidden)').last()[0];
        if (!lastVisibleComment) { //There are no comments visible
            comments.prepend(mess);
        } else { // There are some comments visible.
            lastVisibleComment.insertAdjacentHTML("afterend", mess);
        }
        $(`.comment[commentID=${commentID}]`).last()[0].scrollIntoView({ block: 'center', behavior: 'smooth' });

        $.post("/feed", {
            postID: postID,
            new_comment: date,
            videoTime: videoTime,
            comment_text: text,
            postClass: postClass,
            reply_to: reply_to,
            parent_comment: parent_comment,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        }).then(function(json) {
            script.numComments = json.numComments;
        });
    }
}

$(window).on('load', () => {
    //add humanized time to all posts
    $('span.date').each(function() {
        const ms = parseInt($(this).text(), 10);
        const time = new Date(ms);
        $(this).text(humanized_time_span(time));
    });

    $('.ui.comments').show();

    // ************ Actions on Main Post ***************

    // Press enter to submit a comment
    window.addEventListener("keydown", function(event) {
        if (!event.ctrlKey && event.key === "Enter" && $(event.target).hasClass("replyToVideo")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            addCommentToVideo(event);
        } else if (!event.ctrlKey && event.key === "Enter" && $(event.target).hasClass("replyToComment")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            addCommentToComment(event);
        }
    }, true);

    //Create a new Comment
    $("i.big.send.link.icon.replyToVideo").on('click', addCommentToVideo);

    //Like Post
    $('.like.button').on('click', likePost);

    //Unlike Post
    $('.unlike.button').on('click', unlikePost);

    //Flag Post
    $('.flag.button').on('click', flagPost);

    //Share Post
    // $('.share.button').on('click', sharePost);

    // ************ Actions on Comments***************
    // Like comment
    $('a.like').on('click', likeComment);

    // Unlike comment
    $('a.unlike').on('click', unlikeComment);

    //Flag comment
    $('a.flag').on('click', flagComment);

    //Flag comment
    $('a.unflag').on('click', unflagComment);

    //Share comment 
    // $('a.share').on('click', shareComment);

    //Reply to comment
    $('a.reply').on('click', openCommentReply);
});