class Timer {
  /**
   * Constructor
   *
   * @param {function} callback
   */

  constructor(callback) {
    this.callback = callback
    this.cancel = null
  }

  /**
   * Start Timer
   *
   * @param {null|number} interval
   */

  start(interval = null) {
    if (this.cancel) throw new Error(`Can't call 'start' when timer is running`)

    if (interval == null) {
      const frameId = window.requestAnimationFrame(this.callback)
      this.cancel = () => window.cancelAnimationFrame(frameId)
    } else {
      const timeoutId = window.setTimeout(this.callback, interval)
      this.cancel = () => window.clearTimeout(timeoutId)
    }
  }

  /**
   * Stop Timer
   */

  stop() {
    if (this.cancel == null) return
    this.cancel()
    this.cancel = null
  }
}

export default Timer
