browser = (typeof browser === 'undefined') ? chrome : browser;

Math.lerp = function(value1, value2, amount) {
    return (1 - amount) * value1 + amount * value2;
};

Math.pointDistance2d = function(x1, y1, x2, y2) {
    const a = x2 - x1;
    const b = y2 - y1;
    return Math.sqrt(a * a + b * b);
}

const waitIntervals = [];
function waitFor(conditionCheck, timeout) {
    return new Promise((resolve, reject) => {
        let intervalIndex;
        waitIntervals.push(
            setInterval(() => {
                if (conditionCheck()) {
                    clearInterval(waitIntervals[intervalIndex]);
                    resolve();
                }
            }, 10)
        );
        intervalIndex = waitIntervals.length - 1;
        setTimeout(() => {
            clearInterval(waitIntervals[intervalIndex]);
            resolve();
        }, timeout || 5000);
    });
};

function addCss(css) {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    waitFor(() => {
        const head = document.querySelector('head');
        if (head) {
            head.appendChild(style);
        }
        return !!head;
    });
    return style;
};

async function sendMessageToCurrentTab(message) {
    browser.runtime.sendMessage({
        topic: 'sendMessageToCurrentTab',
        message
    });
}

let iframeId = null;
window.addEventListener('message', (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.WEB_BROWSER_MEDIA_REMOTE_CONTROL_IFRAME_ID != null) {
            iframeId = data.WEB_BROWSER_MEDIA_REMOTE_CONTROL_IFRAME_ID;
        }
    } catch (error) {}
});

browser.runtime.onMessage.addListener(
    async function(request, sender, sendResponse) {
        if (request.topic === 'mqttReceive') {
            if (request.mqtt.topic === 'scrollController') {
                onScrollControllerChange(request.mqtt.message);
            } else if (request.mqtt.topic === 'focusController') {
                onFocusControllerChange(request.mqtt.message);
            } else if (request.mqtt.topic === 'primaryVideo/requestInfo') {
                onRequestPrimaryVideoInfo();
            } else if (request.mqtt.topic === 'primaryVideo/toggleFullscreen') {
                onTogglePrimaryVideoFullscreen();
            } else if (request.mqtt.topic === 'primaryVideo/togglePlay') {
                onTogglePrimaryVideoPlay();
            } else if (request.mqtt.topic === 'primaryVideo/seekForward') {
                onTogglePrimaryVideoSeekForward(request.mqtt.message);
            } else if (request.mqtt.topic === 'primaryVideo/seekBackward') {
                onTogglePrimaryVideoSeekBackward(request.mqtt.message);
            } else if (/tabs\/zoom(In|Out)/g.test(request.mqtt.topic)) {
                document.getElementById('WEB_BROWSER_MEDIA_REMOTE_CONTROL_FOCUS_RECT')?.remove();
            }
        } else if (request.topic === 'iframeVideoSearchRequest') {
            const primaryVideoInfo = getPrimaryVideoInfo();
            if (primaryVideoInfo.video) {
                await sendMessageToCurrentTab({
                    topic: 'iframeVideoSearchResponse',
                    message: {
                        id: iframeId,
                        frameUrl: window.location.href,
                        videoSize: primaryVideoInfo.size,
                        videoPaused: primaryVideoInfo.video.paused
                    }
                });
            }
        } else if (request.topic === 'iframeVideoSearchResponse') {
            iframeVideoCandidates.push(request.message);
        } else if (request.topic === 'iframeEmbeddedCall') {
            if (request.message.id === iframeId) {
                if (request.message.handler === 'onHandleTogglePrimaryVideoPlay') {
                    onHandleTogglePrimaryVideoPlay();
                } else if (request.message.handler === 'onHandleTogglePrimaryVideoSeekForward') {
                    onHandleTogglePrimaryVideoSeekForward(request.message.args);
                } else if (request.message.handler === 'onTogglePrimaryVideoSeekBackward') {
                    onTogglePrimaryVideoSeekBackward(request.message.args);
                }
            }
        }
    }
);

document.addEventListener('DOMContentLoaded', () => {
    if (window.getComputedStyle(document.documentElement).overflow == 'hidden') {
        pageScrollElement = document.body;
    }
});

/**
 * Current tab scroll controller
 */

let pageScrollElement = document.documentElement;
let pageScrollControllerState = 'committed';
let pageScrollStartScrollLeft = 0;
let pageScrollStartScrollTop = 0;
let pageScrollTargetScrollLeft = 0;
let pageScrollTargetScrollTop = 0;
let pageScrollMomentumX = 0;
let pageScrollMomentumY = 0;
let pageScrollMomentumFriction = 0.05;
let lastPageScrollEventTime = 0;
let lastPageScrollAnimateTime = 0;
let isAnimatingPageScroll = false;

function onScrollControllerChange(message) {
    if (window.top !== window) return;

    if (pageScrollControllerState !== 'preview' && message.state === 'preview') {
        pageScrollStartScrollLeft = pageScrollElement.scrollLeft;
        pageScrollStartScrollTop = pageScrollElement.scrollTop;
        pageScrollTargetScrollLeft = pageScrollStartScrollLeft;
        pageScrollTargetScrollTop = pageScrollStartScrollTop;
        pageScrollMomentumX = 0;
        pageScrollMomentumY = 0;
    }
    const targetMomentumX = ((pageScrollStartScrollLeft + message.dx) - pageScrollTargetScrollLeft) / ((message.t - lastPageScrollEventTime));
    const targetMomentumY = ((pageScrollStartScrollTop + message.dy) - pageScrollTargetScrollTop) / ((message.t - lastPageScrollEventTime));
    pageScrollMomentumX = Math.lerp(targetMomentumX, pageScrollMomentumX, 0.5);
    pageScrollMomentumY = Math.lerp(targetMomentumY, pageScrollMomentumY, 0.5);
    pageScrollTargetScrollLeft = pageScrollStartScrollLeft + message.dx;
    pageScrollTargetScrollTop = pageScrollStartScrollTop + message.dy;
    pageScrollControllerState = message.state;
    lastPageScrollEventTime = message.t;
    if (!isAnimatingPageScroll) {
        isAnimatingPageScroll = true;
        scrollAnimate();
    }
    document.getElementById('WEB_BROWSER_MEDIA_REMOTE_CONTROL_FOCUS_RECT')?.remove();
    lastFocusedElement = null;
}

function scrollAnimate() {
    if (window.top !== window) return;

    let delta = window.performance.now() - lastPageScrollAnimateTime;
    lastPageScrollAnimateTime = window.performance.now();
    if (pageScrollControllerState === 'committed') {
        if (Math.abs(pageScrollMomentumX) > 0.5) {
            pageScrollTargetScrollLeft += pageScrollMomentumX * delta;
            pageScrollMomentumX = Math.lerp(pageScrollMomentumX, 0, pageScrollMomentumFriction);
        }
        if (Math.abs(pageScrollMomentumY) > 0.5) {
            pageScrollTargetScrollTop += pageScrollMomentumY * delta;
            pageScrollMomentumY = Math.lerp(pageScrollMomentumY, 0, pageScrollMomentumFriction);
        }
    }
    let previousScrollLeft = pageScrollElement.scrollLeft;
    let previousScrollTop = pageScrollElement.scrollTop;
    pageScrollElement.scrollLeft = Math.lerp(pageScrollTargetScrollLeft, pageScrollElement.scrollLeft, 0.25);
    pageScrollElement.scrollTop = Math.lerp(pageScrollTargetScrollTop, pageScrollElement.scrollTop, 0.25);
    if (
        Math.abs(pageScrollElement.scrollLeft - previousScrollLeft) < 1 &&
        Math.abs(pageScrollElement.scrollTop - previousScrollTop) < 1
    ) {
        isAnimatingPageScroll = false;
        return;
    } else {
        requestAnimationFrame(scrollAnimate);
    }
}

/**
 * Focusable element control
 */

let lastFocusedElement = null;
const focussableElements = 'a[href]:not([disabled]), button:not([disabled]), input[type=text]:not([disabled]), [tabindex]:not([disabled]):not([tabindex="-1"])';
const DIRECTION_UP = 0;
const DIRECTION_RIGHT = 1;
const DIRECTION_DOWN = 2;
const DIRECTION_LEFT = 3;

function focusScreenCenter() {
    if (window.top !== window) return;

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    let closestElement = null;
    let closestDistance = Infinity;

    document.querySelectorAll(focussableElements).forEach((element) => {
        if ((element.offsetWidth > 0 || element.offsetHeight > 0)) {
            const elementRect = element.getBoundingClientRect();
            const averageX = elementRect.left + (elementRect.right - elementRect.left) / 2;
            const averageY = elementRect.top + (elementRect.bottom - elementRect.top) / 2;
            const distance = Math.pointDistance2d(centerX, centerY, averageX, averageY);
            if (distance < closestDistance) {
                closestElement = element;
                closestDistance = distance;
            }
        }
    });

    if (closestElement) {
        closestElement.focus();
    }
}

function focusElementInDirection(direction) {
    if (window.top !== window) return;

    let closestDirectElement = null;
    let closestIndirectElement = null;

    if (!lastFocusedElement) {
        focusScreenCenter();
    } else {
        const activeElementRect = document.activeElement.getBoundingClientRect();

        const primaryAxisStart = {
            [DIRECTION_UP]: activeElementRect.top,
            [DIRECTION_RIGHT]: activeElementRect.right,
            [DIRECTION_DOWN]: activeElementRect.bottom,
            [DIRECTION_LEFT]: activeElementRect.left
        }[direction];
        const primaryAxisCheck = {
            [DIRECTION_UP]: 'top',
            [DIRECTION_RIGHT]: 'right',
            [DIRECTION_DOWN]: 'bottom',
            [DIRECTION_LEFT]: 'left'
        }[direction];
        const primaryAxisDirection = {
            [DIRECTION_UP]: -1,
            [DIRECTION_RIGHT]: 1,
            [DIRECTION_DOWN]: 1,
            [DIRECTION_LEFT]: -1
        }[direction];
        const primaryAxisIsHorizontal = {
            [DIRECTION_UP]: false,
            [DIRECTION_RIGHT]: true,
            [DIRECTION_DOWN]: false,
            [DIRECTION_LEFT]: true
        }[direction];
        const secondaryAxisSize = primaryAxisIsHorizontal ? activeElementRect.bottom - activeElementRect.top : activeElementRect.right - activeElementRect.left;

        // Direct - in straight line of sight within the specified direction
        closestDirectElement = null;
        let closestDirectDistance = Infinity;
        let closestDirectCommonSize = 0;

        // Indirect - also consideres elements that could be at an angle, not precisely in specified direction
        closestIndirectElement = null;
        let closestIndirectDistance = Infinity;
        let closestIndirectSecondaryAxisAverage = Infinity;
        let closestIndirectAngleAverage = Infinity;

        document.querySelectorAll(focussableElements).forEach((element) => {
            if ((element.offsetWidth > 0 || element.offsetHeight > 0) && element !== document.activeElement) {
                const elementRect = element.getBoundingClientRect();
                
                const distance = primaryAxisDirection * (elementRect[primaryAxisCheck] - primaryAxisStart);

                if (distance > 0) {
                    if (distance <= closestDirectDistance) {
                        if (
                            (primaryAxisIsHorizontal && !(elementRect.top > activeElementRect.bottom || elementRect.bottom < activeElementRect.top)) ||
                            (!primaryAxisIsHorizontal && !(elementRect.right < activeElementRect.left || elementRect.left > activeElementRect.right))
                        ) {
                            let commonSize = secondaryAxisSize;
                            if (primaryAxisIsHorizontal) {
                                if (elementRect.top > activeElementRect.top) {
                                    commonSize -= elementRect.top - activeElementRect.top;
                                }
                                if (elementRect.bottom < activeElementRect.bottom) {
                                    commonSize -= activeElementRect.bottom - elementRect.bottom;
                                }
                            } else {
                                if (elementRect.left > activeElementRect.left) {
                                    commonSize -= elementRect.left - activeElementRect.left;
                                }
                                if (elementRect.right < activeElementRect.right) {
                                    commonSize -= activeElementRect.right - elementRect.right;
                                }
                            }
                            if (distance < closestDirectDistance || commonSize > closestDirectCommonSize) {
                                closestDirectElement = element;
                                closestDirectDistance = distance;
                                closestDirectCommonSize = commonSize;
                            }
                        }
                    }
                    if (!closestDirectElement && distance <= closestIndirectDistance) {
                        const secondaryAxisAverage = primaryAxisIsHorizontal
                            ? Math.abs((elementRect.bottom - elementRect.top) - (activeElementRect.bottom - activeElementRect.top))
                            : Math.abs((elementRect.right - elementRect.left) - (activeElementRect.right - activeElementRect.left));
                        const angleAverage = Math.abs(secondaryAxisAverage - distance);
                        if (closestIndirectDistance == Infinity || secondaryAxisAverage < closestIndirectSecondaryAxisAverage) {
                            closestIndirectElement = element;
                            closestIndirectDistance = distance;
                            closestIndirectSecondaryAxisAverage = secondaryAxisAverage;
                            closestIndirectAngleAverage = angleAverage;
                        }
                    }
                }
            }
        });
    }

    document.getElementById('WEB_BROWSER_MEDIA_REMOTE_CONTROL_FOCUS_RECT')?.remove();

    const newActiveElement = (closestDirectElement || closestIndirectElement || document.activeElement);
    if (newActiveElement) {
        lastFocusedElement = newActiveElement;
        newActiveElement.focus();
        newActiveElement.scrollIntoView({ inline: 'center', block: 'center' });

        try {
            const newActiveElementRect = newActiveElement.getBoundingClientRect();
            const focusRect = document.createElement('div');
            focusRect.id = 'WEB_BROWSER_MEDIA_REMOTE_CONTROL_FOCUS_RECT';
            focusRect.style = 'display: block; position: fixed; box-shadow: white 0px 0px 0 2px, #08479b 0px 0px 0 6px; z-index: 999999999; pointer-events: none;';
            focusRect.style.top = newActiveElementRect.top + 'px';
            focusRect.style.left = newActiveElementRect.left + 'px';
            focusRect.style.width = newActiveElementRect.width + 'px';
            focusRect.style.height = newActiveElementRect.height + 'px';
            document.body.appendChild(focusRect);
        } catch (error) {
            console.error(error);
        }
    }
}

function activateActiveElement() {
    if (window.top !== window) return;

    document.getElementById('WEB_BROWSER_MEDIA_REMOTE_CONTROL_FOCUS_RECT')?.remove();
    if (document.activeElement) {
        document.activeElement.click();
    }
}

function onFocusControllerChange(message) {
    if (window.top !== window) return;

    if (message.activate) {
        activateActiveElement();
    } else if (message.move) {
        focusElementInDirection({
            'up': DIRECTION_UP,
            'right': DIRECTION_RIGHT,
            'down': DIRECTION_DOWN,
            'left': DIRECTION_LEFT
        }[message.move]);
    }
}

/**
 * Video control
 */

let hasPlayedVideoMap = new WeakMap();
let iframeVideoCandidates = [];
let fullscreenVideoContainer = null;
let currentFullscreenVideoElement = null;
let fullscreenVideoOldStyles = null;
let fullscreenVideoPlaceholder = null;
let fullscreenVideoMutationObserver = null;

function getPrimaryVideoInfo() {
    let largestElement = null;
    let largestSize = -1;

    if (currentFullscreenVideoElement) {
        return currentFullscreenVideoElement;
    }

    document.querySelectorAll('video').forEach((element) => {
        if (!element.paused) {
            largestElement = element;
            largestSize = Infinity;
        } else if ((element.offsetWidth > 0 || element.offsetHeight > 0)) {
            const elementRect = element.getBoundingClientRect();
            const onscreenWidth = elementRect.width + Math.min(elementRect.left, 0) + Math.min(window.innerWidth - elementRect.right, 0);
            const onscreenHeight = elementRect.height + Math.min(elementRect.top, 0) + Math.min(window.innerHeight - elementRect.bottom, 0);
            const size = onscreenWidth * onscreenHeight;
            if (size > largestSize) {
                largestElement = element;
                largestSize = size;
            }
        }
    });
    return {
        video: largestElement,
        size: largestSize
    };
}

async function searchForPrimaryVideoAcrossFrames() {
    if (window != window.top) return;
    iframeVideoCandidates = [];

    const iframes = document.querySelectorAll('iframe');

    iframes.forEach((iframe, i) => {
        iframe.contentWindow.postMessage(JSON.stringify({
            WEB_BROWSER_MEDIA_REMOTE_CONTROL_IFRAME_ID: i
        }), '*');
    });
    await sendMessageToCurrentTab({
        topic: 'iframeVideoSearchRequest'
    });
    await new Promise((resolve) => {
        setTimeout(resolve, 50);
    });
    let largestFrame = null;
    let largestFrameElement = null;
    let largestSize = -1;
    let largestIsPaused = true;

    const topPrimaryVideoInfo = getPrimaryVideoInfo();
    if (topPrimaryVideoInfo.video) {
        largestFrame = 'top';
        largestSize = topPrimaryVideoInfo.size;
        largestIsPaused = topPrimaryVideoInfo.video.paused;
    }

    iframes.forEach((iframe, i) => {
        const iframeInfo = iframeVideoCandidates.filter(frameInfo => frameInfo.id === i)[0];
        if (iframeInfo) {
            const iframeRect = iframe.getBoundingClientRect();
            const onscreenWidth = iframeRect.width + Math.min(iframeRect.left, 0) + Math.min(window.innerWidth - iframeRect.right, 0);
            const onscreenHeight = iframeRect.height + Math.min(iframeRect.top, 0) + Math.min(window.innerHeight - iframeRect.bottom, 0);
            const size = onscreenWidth * onscreenHeight;
            if (size > largestSize) {
                largestFrame = iframeInfo.id;
                largestFrameElement = iframe;
                largestSize = size;
                largestIsPaused = iframeInfo.videoPaused;
            }
        }
    });

    const result = {
        frame: largestFrame,
        frameElement: largestFrameElement,
        paused: largestIsPaused
    };

    return result;
}

async function onRequestPrimaryVideoInfo() {
    if (window != window.top) return;

    const videoInfo = await searchForPrimaryVideoAcrossFrames();
    browser.runtime.sendMessage({
        topic: 'mqttSend',
        mqtt: {
            topic: 'primaryVideo/info',
            message: {
                exists: videoInfo.frame != null,
                paused: videoInfo.paused
            }
        }
    });
}

async function onTogglePrimaryVideoPlay() {
    if (window != window.top) return;
    const videoInfo = await searchForPrimaryVideoAcrossFrames();
    if (videoInfo.frame == null) return;
    if (videoInfo.frame === 'top') {
        onHandleTogglePrimaryVideoPlay();
    } else {
        await sendMessageToCurrentTab({
            topic: 'iframeEmbeddedCall',
            message: {
                id: videoInfo.frame,
                handler: 'onHandleTogglePrimaryVideoPlay'
            }
        });
    }
}

function onHandleTogglePrimaryVideoPlay() {
    const primaryVideo = getPrimaryVideoInfo().video;
    if (primaryVideo) {
        if (window.location.href.includes('youtube.com/embed/')) {
            document.querySelector('button.ytp-button[aria-label="Play"]').click()
        } else {
            if (!primaryVideo.hasAttribute('data-web-browser-media-remote-control-has-played-once') && primaryVideo.classList.contains('jw-video')) {
                const jwplayer = primaryVideo.closest('.jwplayer') || document.querySelector('.jwplayer');
                console.log(jwplayer);
                console.log(jwplayer.querySelector('[role="button"][aria-label="Play"]'));
                jwplayer.querySelector('[role="button"][aria-label="Play"]').click();
            } else {
                if (primaryVideo.paused) {
                    HTMLVideoElement.prototype.play.call(primaryVideo);
                } else {
                    HTMLVideoElement.prototype.pause.call(primaryVideo);
                }
            }
        }
        primaryVideo.setAttribute('data-web-browser-media-remote-control-has-played-once', true);
        browser.runtime.sendMessage({
            topic: 'mqttSend',
            mqtt: {
                topic: 'primaryVideo/info',
                message: {
                    exists: !!primaryVideo,
                    paused: primaryVideo?.paused
                }
            }
        });
    }
}

async function onTogglePrimaryVideoSeekForward(message) {
    if (window != window.top) return;
    
    const videoInfo = await searchForPrimaryVideoAcrossFrames();
    if (videoInfo.frame == null) return;
    if (videoInfo.frame === 'top') {
        onHandleTogglePrimaryVideoSeekForward(message);
    } else {
        await sendMessageToCurrentTab({
            topic: 'iframeEmbeddedCall',
            message: {
                id: videoInfo.frame,
                handler: 'onHandleTogglePrimaryVideoSeekForward',
                args: message
            }
        });
    }
}

function onHandleTogglePrimaryVideoSeekForward(message) {
    const primaryVideo = getPrimaryVideoInfo().video;
    if (primaryVideo) {
        if (window.location.host.includes('netflix.com')) {
            document.querySelector('button[aria-label="Seek Forward"]').click();
        } else {
            primaryVideo.currentTime += (message?.ms || 5000) / 1000;
        }
    }
}

async function onTogglePrimaryVideoSeekBackward(message) {
    if (window != window.top) return;
    
    const videoInfo = await searchForPrimaryVideoAcrossFrames();
    if (videoInfo.frame == null) return;
    if (videoInfo.frame === 'top') {
        onHandleTogglePrimaryVideoSeekBackward(message);
    } else {
        await sendMessageToCurrentTab({
            topic: 'iframeEmbeddedCall',
            message: {
                id: videoInfo.frame,
                handler: 'onHandleTogglePrimaryVideoSeekBackward',
                args: message
            }
        });
    }
}

function onHandleTogglePrimaryVideoSeekBackward(message) {
    const primaryVideo = getPrimaryVideoInfo().video;
    if (primaryVideo) {
        if (window.location.host.includes('netflix.com')) {
            document.querySelector('button[aria-label="Seek Back"]').click();
        } else {
            primaryVideo.currentTime -= (message?.ms || 5000) / 1000;
        }
    }
}

async function onTogglePrimaryVideoFullscreen() {
    if (window != window.top) return;

    const videoInfo = await searchForPrimaryVideoAcrossFrames();
    if (videoInfo.frame == null) return;
    if (videoInfo.frame === 'top') {
        onHandleTogglePrimaryVideoFullscreen(getPrimaryVideoInfo().video);
    } else if (videoInfo.frameElement) {
        onHandleTogglePrimaryVideoFullscreen(videoInfo.frameElement);
    }
}

function onHandleTogglePrimaryVideoFullscreen(primaryVideo) {
    document.getElementById('WEB_BROWSER_MEDIA_REMOTE_CONTROL_FULLSCREEN_VIDEO_CONTAINER')?.remove();
    if (currentFullscreenVideoElement) {
        document.documentElement.classList.remove('WEB_BROWSER_MEDIA_REMOTE_CONTROL_IS_FULLSCREEN');
        currentFullscreenVideoElement.style = fullscreenVideoOldStyles;
        fullscreenVideoPlaceholder.after(currentFullscreenVideoElement);
        fullscreenVideoContainer.remove();
        fullscreenVideoPlaceholder.remove();
        currentFullscreenVideoElement = null;
        fullscreenVideoPlaceholder = null;
        fullscreenVideoContainer = null;
        if (fullscreenVideoMutationObserver) {
            fullscreenVideoMutationObserver.disconnect();
            fullscreenVideoMutationObserver = null;
        }
    } else {
        if (primaryVideo) {
            try {
                fullscreenVideoContainer = document.createElement('div');
                fullscreenVideoContainer.id = 'WEB_BROWSER_MEDIA_REMOTE_CONTROL_FULLSCREEN_VIDEO_CONTAINER';
                fullscreenVideoContainer.style = 'position: fixed; z-index: 9999999999; top: 0; left: 0; right: 0; bottom: 0; background: black;';
                document.body.appendChild(fullscreenVideoContainer);

                fullscreenVideoPlaceholder = document.createComment('');
                primaryVideo.after(fullscreenVideoPlaceholder);
                fullscreenVideoOldStyles = primaryVideo.getAttribute('style');
                primaryVideo.style = '';
                fullscreenVideoContainer.append(primaryVideo);
                currentFullscreenVideoElement = primaryVideo;
                document.documentElement.classList.add('WEB_BROWSER_MEDIA_REMOTE_CONTROL_IS_FULLSCREEN');

                fullscreenVideoMutationObserver = new MutationObserver((mutationsList, observer) => {
                    for (const mutation of mutationsList) {
                        if (mutation.type === 'attributes') {
                            if (mutation.attributeName === 'style') {
                                if (primaryVideo.getAttribute('style') !== '') {
                                    fullscreenVideoOldStyles = primaryVideo.getAttribute('style');
                                    primaryVideo.style = '';
                                }
                            }
                        }
                    }
                });
                fullscreenVideoMutationObserver.observe(primaryVideo, { attributes: true })
            } catch (error) {
                console.error(error);
            }
        }
    }
}

addCss(`
    html.WEB_BROWSER_MEDIA_REMOTE_CONTROL_IS_FULLSCREEN, html.WEB_BROWSER_MEDIA_REMOTE_CONTROL_IS_FULLSCREEN > body {
        overflow: hidden !important;
    }
    #WEB_BROWSER_MEDIA_REMOTE_CONTROL_FULLSCREEN_VIDEO_CONTAINER > video,
    #WEB_BROWSER_MEDIA_REMOTE_CONTROL_FULLSCREEN_VIDEO_CONTAINER > iframe {
        display: block !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
    }
`);
