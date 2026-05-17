const STORAGE_KEY = 'amdocsTrainingBotEnabled';
const config = {
  moduleSectionSelector: '.space-y-2.max-h-96.overflow-y-auto.custom-scrollbar',
  moduleContainerSelector: 'div[data-state].animate-fade-in',
  moduleTitleSelector: '.font-semibold.text-foreground',
  moduleExpandToggleSelector: 'button[aria-expanded]',
  moduleVideosContainerSelector: 'div[data-state="open"] > div.space-y-1.pl-2',
  activeLessonSelector: '.absolute.left-0.w-1.bg-gradient-to-b.from-primary',
  videoItemSelector: '.text-sm.block.truncate',
  videoWatchedSelector: '.lucide-circle-check-big',
  playButtonSelector: '.play-button, .central-play, .center-play, button[aria-label*="play" i], .vjs-play-control, .player-play, .play, .play-btn, .playpause, .player-play-button, .video-overlay, .video-play',
  videoContainerSelector: '.video-player, .player, .video-container, .player-wrapper, .course-player, .video-box',
  videoElementSelector: 'video',
  progressTextSelector: '.text-2xl.font-bold.text-primary'
};
let autoRun = false;
let loopHandle = null;
let cycleRunning = false;

function log(...args) {
  console.log('[Amdocs Training Bot]', ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPageVisibleForTracking() {
  return document.visibilityState === 'visible' && !document.hidden && document.hasFocus();
}

async function waitForVisiblePlaybackContext(timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (isPageVisibleForTracking()) {
      return true;
    }
    log('Waiting for the course tab to stay visible and focused so watch time can be counted');
    await sleep(1000);
  }
  return isPageVisibleForTracking();
}

function getProgressPercent() {
  const progressEl = document.querySelector(config.progressTextSelector);
  if (progressEl && progressEl.textContent) {
    const match = progressEl.textContent.match(/(\d{1,3})%/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  const header = Array.from(document.querySelectorAll('div,span,p,section')).find((el) => {
    return el.textContent && /course progress/i.test(el.textContent);
  });
  if (header && header.textContent) {
    const match = header.textContent.match(/(\d{1,3})%/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  const percentEl = Array.from(document.querySelectorAll('*')).find((el) => {
    return el.textContent && el.textContent.match(/\d{1,3}%/);
  });
  if (!percentEl || !percentEl.textContent) {
    return null;
  }
  const match = percentEl.textContent.match(/(\d{1,3})%/);
  return match ? parseInt(match[1], 10) : null;
}

function isWatched(item) {
  if (!item) {
    return false;
  }
  const text = item.textContent || '';
  if (text.includes('✔') || text.includes('✓') || text.match(/completed|done|watched/i)) {
    return true;
  }
  if (item.matches && item.matches(config.videoWatchedSelector)) {
    return true;
  }
  const lessonDiv = item.closest('.relative.p-3.rounded-lg.cursor-pointer');
  if (lessonDiv) {
    const child = lessonDiv.querySelector(config.videoWatchedSelector);
    if (child) {
      return true;
    }
  }
  const child = item.querySelector(config.videoWatchedSelector);
  return Boolean(child);
}

function getModuleTitle(module) {
  return module.querySelector(config.moduleTitleSelector) || module.querySelector('h1,h2,h3,h4,h5,button,span,div');
}

function getVideoItemsWithinModule(module) {
  const title = getModuleTitle(module);
  return Array.from(module.querySelectorAll(config.videoItemSelector)).filter((item) => {
    if (!item.textContent) {
      return false;
    }
    const text = item.textContent.trim();
    if (text.length < 3 || text.length > 80) {
      return false;
    }
    if (item === module) {
      return false;
    }
    if (title && (title === item || title.contains(item))) {
      return false;
    }
    if (item.matches && item.matches(config.moduleExpandToggleSelector)) {
      return false;
    }
    if (item.closest(config.moduleContainerSelector) !== module) {
      return false;
    }
    return true;
  });
}

function isModuleExpanded(module) {
  const container = module.querySelector('div[data-state="open"]');
  return container && container.offsetHeight > 0;
}

function findActiveLessonInModule(module) {
  const active = module.querySelector(config.activeLessonSelector);
  if (active && getVideoItemsWithinModule(module).includes(active)) {
    return active;
  }
  const watchedVideos = getVideoItemsWithinModule(module).filter(isWatched);
  return watchedVideos.length ? watchedVideos[watchedVideos.length - 1] : null;
}

function findModuleWithActiveLesson() {
  const moduleRoot = findModuleRoot();
  const modules = Array.from(moduleRoot.children).filter((child) => child && child.textContent && child.textContent.trim().length > 0);
  for (const module of modules) {
    if (module.querySelector(config.activeLessonSelector)) {
      log('Found active module:', (module.textContent || '').trim().slice(0, 50));
      return module;
    }
  }
  // Fallback: assume current module is the one with most watched videos
  let bestModule = null;
  let bestWatchedCount = -1;
  modules.forEach((module) => {
    const watched = getVideoItemsWithinModule(module).filter(isWatched).length;
    if (watched > bestWatchedCount) {
      bestWatchedCount = watched;
      bestModule = module;
    }
  });
  if (bestModule) {
    log('Using module with most watched videos as current:', (bestModule.textContent || '').trim().slice(0, 50));
  } else {
    log('No active module found');
  }
  return bestModule;
}

function findFirstUnwatchedInModule(module) {
  const videos = getVideoItemsWithinModule(module);
  return videos.find((item) => !isWatched(item)) || null;
}

function findNextVideoInModule(module) {
  const lessons = getVideoItemsWithinModule(module);
  if (!lessons.length) {
    return null;
  }

  const active = findActiveLessonInModule(module);
  if (active) {
    const activeIndex = lessons.indexOf(active);
    if (activeIndex >= 0) {
      for (let i = activeIndex + 1; i < lessons.length; i += 1) {
        if (!isWatched(lessons[i])) {
          log('Next video after highlighted item:', (lessons[i].textContent || '').trim().slice(0, 80));
          return lessons[i];
        }
      }
    }
  }

  return findFirstUnwatchedInModule(module);
}

function clickModule(module) {
  const toggle = module.querySelector(config.moduleExpandToggleSelector) || getModuleTitle(module);
  if (toggle) {
    if (clickElement(toggle)) {
      log('Expanded module:', (toggle.textContent || '').trim().slice(0, 80));
      return true;
    }
  }
  return false;
}

function findModuleRoot() {
  const scrollbarDiv = document.querySelector('.space-y-2.max-h-96.overflow-y-auto.custom-scrollbar');
  if (scrollbarDiv) {
    return scrollbarDiv;
  }
  const header = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div')).find((el) => {
    return el.textContent && /course modules/i.test(el.textContent);
  });
  if (header) {
    return header.closest('section,aside,div') || header.parentElement || document.body;
  }
  return document.querySelector(config.moduleSectionSelector) || document.body;
}

async function findNextVideoItem() {
  const moduleRoot = findModuleRoot();
  let modules = Array.from(moduleRoot.querySelectorAll(config.moduleContainerSelector));
  if (!modules.length) {
    log('No modules found with selector', config.moduleContainerSelector);
    modules = Array.from(moduleRoot.children).filter((child) => child && child.textContent && child.textContent.trim().length > 0);
  }

  const currentModule = findModuleWithActiveLesson();
  if (currentModule) {
    log('Current active module found, processing it first');
    if (!isModuleExpanded(currentModule)) {
      clickModule(currentModule);
      await sleep(1000);
    }
    const nextInCurrent = findNextVideoInModule(currentModule);
    if (nextInCurrent) {
      return nextInCurrent;
    }
    log('No next video in current module, moving to next modules');
    const currentIndex = modules.indexOf(currentModule);
    for (let i = currentIndex + 1; i < modules.length; i += 1) {
      const nextModule = modules[i];
      if (!isModuleExpanded(nextModule)) {
        clickModule(nextModule);
        await sleep(2000); // Increased wait for lessons to load
      }
      const firstInNext = findFirstUnwatchedInModule(nextModule);
      if (firstInNext) {
        log('Moving to next module');
        return firstInNext;
      }
    }
  }

  log('No active module or no next lesson in current module; scanning modules sequentially');
  for (const module of modules) {
    if (!isModuleExpanded(module)) {
      clickModule(module);
      await sleep(2000); // Increased wait
    }
    const firstUnwatched = findFirstUnwatchedInModule(module);
    if (firstUnwatched) {
      return firstUnwatched;
    }
  }

  log('Falling back to searching any video item directly');
  const fallbackItems = Array.from(document.querySelectorAll(config.videoItemSelector)).filter((item) => {
    const text = item.textContent ? item.textContent.trim() : '';
    return text.length > 3 && text.length < 80;
  });
  return fallbackItems.find((item) => !isWatched(item)) || null;
}

function clickElement(el) {
  if (!el || typeof el.scrollIntoView !== 'function') {
    log('Invalid element to click:', el);
    return false;
  }
  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    el.click();
    return true;
  } catch (error) {
    log('Click failed:', error);
    return false;
  }
}

function dispatchInteractionSequence(el) {
  if (!el) {
    return;
  }
  const events = [
    ['pointerover', { bubbles: true, cancelable: true, pointerType: 'mouse' }],
    ['mouseover', { bubbles: true, cancelable: true }],
    ['pointerenter', { bubbles: true, cancelable: true, pointerType: 'mouse' }],
    ['mouseenter', { bubbles: true, cancelable: true }],
    ['pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1 }],
    ['mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }],
    ['pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 0 }],
    ['mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0 }],
    ['click', { bubbles: true, cancelable: true, button: 0 }]
  ];

  for (const [type, init] of events) {
    try {
      const EventCtor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new EventCtor(type, init));
    } catch (error) {
      log('Interaction dispatch failed for', type, error);
    }
  }
}

function findPlayButton() {
  const button = document.querySelector(config.playButtonSelector);
  if (button) {
    return button;
  }

  const candidates = Array.from(document.querySelectorAll('button, a, div, span, svg')).filter((element) => {
    if (element.offsetParent === null) {
      return false;
    }
    const text = (element.textContent || '').trim().toLowerCase();
    const aria = (element.getAttribute('aria-label') || '').toLowerCase();
    const cls = (element.className || '').toString().toLowerCase();
    return (
      text.includes('play') ||
      aria.includes('play') ||
      cls.includes('play') ||
      cls.includes('start') ||
      cls.includes('center') ||
      cls.includes('middle') ||
      cls.includes('overlay') ||
      cls.includes('icon')
    );
  });

  const videoContainers = Array.from(document.querySelectorAll(config.videoContainerSelector));
  const centerButton = candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    const pageCenterX = window.innerWidth / 2;
    const pageCenterY = window.innerHeight / 2;
    return rect.left <= pageCenterX && rect.right >= pageCenterX && rect.top <= pageCenterY && rect.bottom >= pageCenterY;
  });
  if (centerButton) {
    return centerButton;
  }

  const insideVideo = candidates.find((element) => videoContainers.some((container) => container.contains(element)));
  return insideVideo || candidates[0] || null;
}

function findVideoInteractionTarget(video) {
  if (!video) {
    return null;
  }
  return video.closest(config.videoContainerSelector) || video.parentElement || video;
}

function pulseWatchActivity(video) {
  const target = findVideoInteractionTarget(video) || video;
  if (!target) {
    return;
  }

  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  dispatchInteractionSequence(target);
  if (video && target !== video) {
    dispatchInteractionSequence(video);
  }
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
}

async function attemptPlayOnVideo(video) {
  if (!video) {
    return false;
  }
  const target = findVideoInteractionTarget(video);
  if (target) {
    dispatchInteractionSequence(target);
  }
  dispatchInteractionSequence(video);
  try {
    await video.play();
    log('Requested video play programmatically');
  } catch (error) {
    log('Programmatic video play failed:', error);
  }
  if (video.paused) {
    log('Video is still paused, clicking the player surface');
    if (target) {
      clickElement(target);
    }
    dispatchInteractionSequence(video);
  }
  if (video.paused) {
    try {
      video.muted = true;
      await video.play();
      log('Retried playback in muted mode as a fallback');
    } catch (error) {
      log('Muted fallback play failed:', error);
    }
  }
  return !video.paused;
}

async function waitForVideoElement(timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const video = document.querySelector(config.videoElementSelector);
    if (video) {
      return video;
    }
    await sleep(500);
  }
  return null;
}

function hasFiniteVideoDuration(video) {
  return Boolean(video && Number.isFinite(video.duration) && video.duration > 0);
}

function isVideoAtEnd(video) {
  if (!video) {
    return false;
  }
  if (video.ended) {
    return true;
  }
  if (!hasFiniteVideoDuration(video)) {
    return false;
  }
  return video.currentTime >= Math.max(video.duration - 0.5, 0);
}

async function waitForVideoMetadata(video, timeout = 15000) {
  if (!video) {
    return false;
  }
  if (hasFiniteVideoDuration(video)) {
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMetadata = () => {
      if (hasFiniteVideoDuration(video)) {
        finish(true);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('durationchange', onMetadata);
    };

    const timer = setTimeout(() => finish(hasFiniteVideoDuration(video)), timeout);

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('durationchange', onMetadata);
  });
}

function getVideoWaitBudgetMs(video) {
  if (!hasFiniteVideoDuration(video)) {
    return 15 * 60 * 1000;
  }

  const remainingSeconds = Math.max(video.duration - video.currentTime, 0);
  return Math.min(Math.max((remainingSeconds + 45) * 1000, 180_000), 15 * 60 * 1000);
}

async function waitForCompletionSignal(item, initialProgress, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (isWatched(item)) {
      log('Lesson marked watched in the sidebar');
      return true;
    }

    const currentProgress = getProgressPercent();
    if (
      initialProgress !== null &&
      currentProgress !== null &&
      currentProgress > initialProgress
    ) {
      log('Course progress increased from', initialProgress, 'to', currentProgress);
      return true;
    }

    await sleep(1000);
  }

  log('No completion signal detected after video end; the site may not have counted this watch');
  return false;
}

async function waitForPageReady(timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (document.readyState === 'complete') {
      return true;
    }
    await sleep(300);
  }
  return document.readyState === 'complete';
}

async function playAndCompleteVideo(item, initialProgress) {
  const visible = await waitForVisiblePlaybackContext();
  if (!visible) {
    log('The course tab did not stay visible and focused long enough to count watch time');
    return false;
  }

  const playButton = findPlayButton();
  if (playButton) {
    log('Clicking play button / control');
    clickElement(playButton);
    dispatchInteractionSequence(playButton);
  }
  const video = await waitForVideoElement();
  if (!video) {
    log('No video element found');
    return false;
  }

  pulseWatchActivity(video);
  await attemptPlayOnVideo(video);
  await waitForVideoMetadata(video);

  if (isVideoAtEnd(video)) {
    log('Video is already at the end');
    return waitForCompletionSignal(item, initialProgress);
  }

  return new Promise((resolve) => {
    let settled = false;
    let lastTime = 0;
    let lastProgressAt = Date.now();
    const start = Date.now();

    const finish = async (result, reason) => {
      if (settled) {
        return;
      }
      settled = true;
      log(reason);
      cleanup();
      if (result) {
        resolve(await waitForCompletionSignal(item, initialProgress));
        return;
      }
      resolve(false);
    };

    const onEnded = () => {
      finish(true, 'Video ended naturally');
    };
    const onError = () => {
      log('Video error occurred');
    };
    const onTimeUpdate = () => {
      if (video.currentTime > lastTime + 0.25) {
        lastProgressAt = Date.now();
      }
      lastTime = video.currentTime;
      if (isVideoAtEnd(video)) {
        finish(true, 'Video reached end time');
      }
    };
    const onPlaying = () => {
      lastProgressAt = Date.now();
      log('Video playback started, currentTime:', video.currentTime.toFixed(1));
    };
    const onPause = () => {
      log('Video paused at', video.currentTime.toFixed(1));
    };
    const cleanup = () => {
      clearInterval(watchdog);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);

    const watchdog = setInterval(async () => {
      if (settled) {
        return;
      }

      if (!isPageVisibleForTracking()) {
        log('Playback is running without an active visible tab; waiting before retrying interaction');
        return;
      }

      if (isVideoAtEnd(video)) {
        await finish(true, 'Video reached end time');
        return;
      }

      if (!video.ended && video.paused) {
        log('Video paused before completion, attempting to resume');
        await attemptPlayOnVideo(video);
        return;
      }

      if (Date.now() - lastProgressAt > 10000) {
        log('Video playback stalled, attempting to resume');
        pulseWatchActivity(video);
        await attemptPlayOnVideo(video);
        lastProgressAt = Date.now();
      }

      if ((Date.now() - start) % 20000 < 3000) {
        pulseWatchActivity(video);
      }

      if (Date.now() - start > getVideoWaitBudgetMs(video)) {
        await finish(false, 'Video wait timed out before natural completion');
      }
    }, 3000);
  });
}

async function runCycle() {
  if (!autoRun) {
    return;
  }
  await waitForPageReady();
  if (!isPageVisibleForTracking()) {
    log('Automation is paused until the Amdocs tab is visible and focused');
    return;
  }
  const progress = getProgressPercent();
  if (progress !== null) {
    log('Current progress:', progress, '%');
    if (progress >= 100) {
      log('Course progress reached 100%. Stopping automation.');
      setAutoRun(false);
      return;
    }
  }

  const item = await findNextVideoItem();
  if (!item) {
    log('No next video item found. Refreshing or waiting for page update.');
    return;
  }

  log('Clicking next video item:', item.textContent ? item.textContent.trim().slice(0, 80) : '(no text)');
  if (!clickElement(item)) {
    log('Failed to click the next item. Waiting before retry.');
    return;
  }
  await sleep(2000);

  const completed = await playAndCompleteVideo(item, progress);
  if (completed) {
    log('Video should be complete; waiting for auto-refresh or other page update.');
    await sleep(5000);
  } else {
    log('Video was played but the website did not confirm progress yet; retrying the same lesson next cycle.');
  }
}

function startLoop() {
  if (loopHandle) {
    return;
  }

  async function loop() {
    if (!autoRun) {
      loopHandle = null;
      return;
    }
    if (cycleRunning) {
      return;
    }
    cycleRunning = true;
    try {
      await runCycle();
    } catch (error) {
      log('Loop error:', error);
    } finally {
      cycleRunning = false;
    }
    if (autoRun) {
      loopHandle = setTimeout(loop, 2000);
    }
  }

  loopHandle = setTimeout(loop, 0);
}

function stopLoop() {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}

function setAutoRun(enabled) {
  autoRun = enabled;
  chrome.storage.local.set({ [STORAGE_KEY]: enabled });
  if (enabled) {
    log('Automation enabled');
    startLoop();
  } else {
    log('Automation disabled');
    stopLoop();
  }
}

chrome.storage.local.get([STORAGE_KEY], (result) => {
  setAutoRun(Boolean(result[STORAGE_KEY]));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'toggleAutomation') {
    setAutoRun(Boolean(message.enabled));
    sendResponse({ status: 'ok' });
  }
  return true;
});
