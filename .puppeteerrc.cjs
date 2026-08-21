const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cache Chromium inside the project directory so it persists on Render runtime
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
