import { start } from 'pretty-error'

function Timer(fn) {
  let stopFn = null

  /**
   * Start the timer using a `requestAnimationFrame` if no interval is
   * specified or using `setTimeout` if an interval is specified
   *
   * @param {number} [interval]
   */

  function start(interval) {
    if (interval == null) {
      const frameId = requestAnimationFrame(fn)
      stopFn = () => cancelAnimationFrame(frameId)
    } else {
      const timeoutId = setTimeout(fn, interval)
      stopFn = () => clearTimeout(timeoutId)
    }
  }

  /**
   * Stop the timer
   */

  function stop() {
    stopFn()
  }

  /**
   * Refresh the timer which basically means don't fire it and restart the
   * timer to push back the point in time at which the `fn` gets called.
   *
   * @param {number} [interval]
   */

  function refresh(interval) {
    stop()
    start(interval)
  }

  return { start, stop, refresh }
}

/**
 * Execute `fn` and then render its effects to the DOM synchronously.
 */
function sync(fn) {
  ReactDOM.flushSync(fn)
}

function ActionManager(options, handlers) {
  const INITIAL_STATE = {
    finish: null,
    events: [],
    mutations: [],
  }

  /**
   * Create a new Timer object that executes the `timeout` function when its
   * timer runs out (usually between user actions like pressing a key or
   * clicking a button)
   */
  const timer = new Timer(timeout)

  let state = { ...INITIAL_STATE }

  function getArg(event) {
    return { ...state, event }
  }

  /**
   * Preprocess handlers to create subsets that are more performant
   */
  const triggerHandlers = handlers.filter(h => h.onTrigger)
  const setupMethods = handlers.filter(h => h.onSetup).map(h => h.onSetup)
  const teardownMethods = handlers
    .filter(h => h.onTeardown)
    .map((h = h.onTeardown))

  /**
   * Call all the `setup` methods
   */
  function setup() {
    setupMethods.forEach(fn => fn())
  }

  /**
   * Call all the `teardown` methods
   */
  function teardown() {
    teardownMethods.forEach(fn => fn())
  }

  /**
   * @param {boolean|function} result
   */
  function handleResult(result) {
    if (typeOf(result) === 'boolean') return result
    invariant(typeOf(result) === 'function')
    state.finishHandler = result
    return false
  }

  /**
   * Handle events including both `trigger` events which come from events in
   * the DOM and `timeout` events which fire when there is inactivity in
   * the browser, usually between sets of events fired by the user.
   *
   * When an `event` comes in, we can handle it in one of two ways:
   *
   * - First, we always start checking to see if any of the `handler.onTrigger`
   *   functions will return a value telling us if it's been handled `true`,
   *   it hasn't been handled yet `true` or it would be considered handled at
   *   some future `event` in which case it returns a `function`. This `function`
   *   because a special type of handler called a `finishHandler`
   * - Second, if there is a `finishHandler`, we run that and see if it returns
   *   a result which we handle just like before. If `true` it's handled,
   *   If `false` it's not and if a `function` we set a new `finishHandler`
   *   which means we want for another event to match.
   *
   * @param {Event} event
   * @return {boolean} finished? are we done with the timer?
   */
  function handleEvent(event) {
    if (state.finishHandler) {
      const result = state.finishHandler(getArg())
    } else {
      let result
      triggerHandlers.find(handler => {
        // handlers must return `true`, `false` or a function. They must not
        // return `undefined`
        result = handler.onTrigger(options)
        invariant(['boolean', 'function'].includes(typeOf(result)))
        return result
      })
    }
    return handleResult(result)
  }

  /**
   * Handle events that originate from the DOM.
   *
   * @param {Event} event
   * @param {Editor} editor
   */
  function trigger(event, editor) {
    invariant(event, 'event is required')
    invariant(editor, 'editor is require')

    timer.stop()

    // add `editor` to `state`
    state.editor = editor

    // We must persist React events if we want to keep them around
    if (event.persist) event.persist()

    // handleEvent
    const isFinished = event.type === 'timeout' ? true : handleEvent(event)

    if (!isFinished) {
      timer.start()
    }
  }

  /**
   * Handle the case where the Timer fires.
   */

  function timeout() {
    const event = { type: 'timeout' }

    handleEvent(event)
  }

  return { trigger }
}
