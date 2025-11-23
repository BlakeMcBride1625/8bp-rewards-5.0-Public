/**
 * Browser Pool Manager
 * Limits concurrent browser instances to prevent VPS crashes
 */

class BrowserPool {
  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.activeBrowsers = 0;
    this.queue = [];
    this.isProcessing = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  release() {
    this.activeBrowsers--;
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeBrowsers < this.maxConcurrent) {
      const resolve = this.queue.shift();
      this.activeBrowsers++;
      resolve();
    }

    this.isProcessing = false;
  }

  getStatus() {
    return {
      activeBrowsers: this.activeBrowsers,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

module.exports = BrowserPool;
