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

function log(...args) {
  console.log('[Amdocs Training Bot]', ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return null;
}

function findNextVideoAfterActive(module) {
  const active = findActiveLessonInModule(module);
  if (!active) {
    return null;
  }
  const videos = getVideoItemsWithinModule(module);
  const index = videos.indexOf(active);
  if (index >= 0 && index + 1 < videos.length) {
    const next = videos[index + 1];
    if (!isWatched(next)) {
      return next;
    }
  }
  return null;
}

function findActiveLessonInModule(module) {
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

async function attemptPlayOnVideo(video) {
  if (!video) {
    return false;
  }
  try {
    video.muted = true;
    await video.play();
    log('Requested video play programmatically');
  } catch (error) {
    log('Programmatic video play failed:', error);
  }
  if (video.paused) {
    log('Video is still paused, clicking video element');
    clickElement(video);
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

async function playAndCompleteVideo() {
  const playButton = findPlayButton();
  if (playButton) {
    log('Clicking play button / control');
    clickElement(playButton);
  }
  const video = await waitForVideoElement();
  if (!video) {
    log('No video element found');
    return false;
  }

  await attemptPlayOnVideo(video);

  return new Promise((resolve) => {
    let ended = false;
    const onEnded = () => {
      ended = true;
      log('Video ended naturally');
      cleanup();
      resolve(true);
    };
    const onError = () => {
      log('Video error occurred');
    };
    const attemptSeek = async () => {
      if (video.duration && !video.paused) {
        try {
          video.currentTime = Math.max(video.duration - 0.5, 0);
          log('Seeking video to end');
        } catch (err) {
          log('Seek failed:', err);
        }
      }
    };
    const cleanup = () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    setTimeout(async () => {
      if (!ended) {
        await attemptSeek();
      }
    }, 4000);
    setTimeout(() => {
      if (!ended) {
        log('Video wait timeout, treating as complete');
        cleanup();
        resolve(true);
      }
    }, 90_000);
  });
}

async function runCycle() {
  if (!autoRun) {
    return;
  }
  await waitForPageReady();
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

  const completed = await playAndCompleteVideo();
  if (completed) {
    log('Video should be complete; waiting for auto-refresh or other page update.');
    await sleep(5000);
  }
}

function startLoop() {
  if (loopHandle) {
    return;
  }
  loopHandle = setInterval(() => {
    runCycle().catch((error) => log('Loop error:', error));
  }, 8000);
  runCycle().catch((error) => log('Initial run error:', error));
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
