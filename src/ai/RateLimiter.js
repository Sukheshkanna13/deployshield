/**
 * RateLimiter — Token bucket algorithm for Anthropic API protection
 *
 * Prevents API rate limit errors during live demos by queuing requests
 * and enforcing minimum spacing between calls.
 *
 * Config defaults match Claude API free tier limits:
 *   - 5 requests per minute max
 *   - 10s minimum gap between requests
 *   - Queue depth 3 (excess requests dropped with reason)
 */
export class RateLimiter {
  constructor({
    maxTokens = 5,
    refillRate = 1,            // tokens per refillInterval
    refillInterval = 12000,    // ms — 1 token every 12s = 5/min
    minGapMs = 10000,          // minimum ms between any two API calls
    maxQueueDepth = 3,
  } = {}) {
    this.maxTokens = maxTokens
    this.tokens = maxTokens
    this.refillRate = refillRate
    this.refillInterval = refillInterval
    this.minGapMs = minGapMs
    this.maxQueueDepth = maxQueueDepth
    this.lastCallTime = 0
    this.queue = []
    this.inFlight = false
    this._startRefill()
  }

  _startRefill() {
    this._refillTimer = setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate)
      this._drain()
    }, this.refillInterval)
  }

  destroy() {
    clearInterval(this._refillTimer)
  }

  /** Attempt to schedule fn. Returns a Promise that resolves when fn completes. */
  schedule(fn, label = 'api-call') {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueDepth) {
        reject(new RateLimitError(`Queue full (depth=${this.maxQueueDepth}). Request "${label}" dropped.`))
        return
      }
      this.queue.push({ fn, resolve, reject, label, queuedAt: Date.now() })
      this._drain()
    })
  }

  async _drain() {
    if (this.inFlight || !this.queue.length) return

    // Token check
    if (this.tokens < 1) return

    // Minimum gap enforcement
    const timeSinceLastCall = Date.now() - this.lastCallTime
    if (timeSinceLastCall < this.minGapMs) {
      setTimeout(() => this._drain(), this.minGapMs - timeSinceLastCall)
      return
    }

    const { fn, resolve, reject, label } = this.queue.shift()
    this.tokens -= 1
    this.inFlight = true
    this.lastCallTime = Date.now()

    try {
      const result = await fn()
      resolve(result)
    } catch (err) {
      reject(err)
    } finally {
      this.inFlight = false
      // Short delay between sequential calls even when tokens available
      setTimeout(() => this._drain(), 500)
    }
  }

  getStatus() {
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      queueDepth: this.queue.length,
      inFlight: this.inFlight,
      msUntilNextToken: Math.max(0, this.minGapMs - (Date.now() - this.lastCallTime)),
    }
  }
}

export class RateLimitError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RateLimitError'
  }
}

// Singleton — shared across all AI calls in the app
export const globalRateLimiter = new RateLimiter()
