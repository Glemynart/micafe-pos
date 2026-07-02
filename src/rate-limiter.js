const crypto = require('crypto');

class RateLimiter {
  constructor() {
    this.attempts = new Map();
    this.locations = new Map(); // IP/MAC based tracking
    this.MAX_ATTEMPTS = 5;
    this.LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos
    this.BASE_DELAY = 1000; // 1 segundo
  }

  getKey(usuario, origin = 'local') {
    return `${usuario}:${origin}`;
  }

  isLocked(key) {
    const record = this.attempts.get(key);
    if (!record) return false;
    if (record.lockedUntil && Date.now() < record.lockedUntil) return true;
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      this.attempts.delete(key);
      return false;
    }
    return false;
  }

  recordAttempt(key) {
    const now = Date.now();
    const record = this.attempts.get(key) || { count: 0, lastAttempt: 0, lockedUntil: null };

    if (now - record.lastAttempt > 30 * 60 * 1000) record.count = 0;

    record.count++;
    record.lastAttempt = now;

    if (record.count >= this.MAX_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION;
    }

    this.attempts.set(key, record);
    this.cleanup();

    return Math.min(this.BASE_DELAY * Math.pow(2, record.count - 1), 30000);
  }

  resetAttempts(key) {
    this.attempts.delete(key);
  }

  getAttemptCount(key) {
    const record = this.attempts.get(key);
    return record ? record.count : 0;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.attempts) {
      if (now - record.lastAttempt > 60 * 60 * 1000) this.attempts.delete(key);
      if (record.lockedUntil && now >= record.lockedUntil) this.attempts.delete(key);
    }
  }
}

module.exports = new RateLimiter();
