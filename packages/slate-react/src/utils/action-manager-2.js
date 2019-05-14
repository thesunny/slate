import Debug from 'debug'
import ReactDOM from 'react-dom'
import invariant from 'tiny-invariant'
import logEvent from './log-event'

function isFunction(fn) {
  return fn && {}.toString.call(fn) === '[object Function]'
}

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

const debug = Debug('slate:action-manager')

/**
 * Execute `fn` and then render its effects to the DOM synchronously.
 */
function sync(fn) {
  ReactDOM.flushSync(fn)
}

function ActionManager(options, handlers) {
  const INITIAL_STATE = {
    // has an action been started yet?
    isStarted: false,
    finish: null,
    events: [],
    mutations: [],
  }

  /**
   * We initialize ActionManager by tracking mutations only once for its
   * entire lifetime. It must be initialized only when it gets is first
   * event.
   */

  let isInitialized = false

  /**
   * The initialize method lets us log all the DOM mutations.
   *
   * @param {Element} element
   */

  function initialize(element) {
    debug('*** INITIALIZE ***')
    const config = {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      charaterDataOldValue: true,
    }

    // childList, attributes, characterData, subtree, attributeOldValue, characterDataOldValue, attributeFilter
    // https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
    // https://dom.spec.whatwg.org/#mutationobserver
    const observer = new MutationObserver(mutate)

    observer.observe(element, config)
  }

  /**
   * Create a new Timer object that executes the `timeout` function when its
   * timer runs out (usually between user actions like pressing a key or
   * clicking a button)
   */
  const timer = new Timer(timeout)

  let state = { ...INITIAL_STATE }

  function getArg(object = {}) {
    return { ...state, ...object }
  }

  /**
   * Preprocess handlers to create subsets that are more performant
   */
  const triggerHandlers = handlers.filter(h => h.onTrigger)
  const setupMethods = handlers.filter(h => h.onSetup).map(h => h.onSetup)
  const teardownMethods = handlers
    .filter(h => h.onTeardown)
    .map(h => h.onTeardown)

  /**
   * Call all the `setup` methods
   */
  function setup() {
    setupMethods.forEach(fn => fn(getArg()))
  }

  /**
   * Call all the `teardown` methods
   */
  function teardown() {
    teardownMethods.forEach(fn => fn(getArg()))
    state = { ...INITIAL_STATE }
  }

  /**
   * @param {boolean|function} result
   */
  function handleResult(result) {
    console.log('handleResult', { result })
    if ([true, false].includes(result)) return result
    invariant(isFunction(result))
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
    let result = false
    if (state.finishHandler) {
      result = state.finishHandler(getArg())
      if (result) {
        debug(`FINISH WITH ${JSON.stringify(result)}`)
      }
    } else {
      const arg = getArg({ event })
      console.log({ arg })

      const matchedHandler = triggerHandlers.find(handler => {
        // handlers must return `true`, `false` or a function. They must not
        // return `undefined`
        result = handler.onTrigger(arg)
        return !!result
      })
      if (matchedHandler) {
        debug(`----- HANDLE - ${JSON.stringify(matchedHandler.name)}`)
      }
    }
    return handleResult(result)
  }

  /**
   * Handle events that originate from the DOM.
   *
   * @param {Event} event
   * @param {Editor} editor
   */
  function trigger(event, editor = state.editor) {
    invariant(event, 'event is required')
    invariant(editor, 'editor is require')

    // add `editor` to `state`
    state.editor = editor

    // Set `state.element` from the event if it's available.
    if (!state.element && event.target) {
      state.element = event.target.closest(`[data-slate-editor]`)
      if (!isInitialized) {
        initialize(state.element)
        isInitialized = true
      }
    }

    // on the first trigger, we set set a flag that we have now started an
    // action and to run all the `handler.onSetup` methods.
    if (!state.isStarted) {
      debug('<==== START ===')
      state.isStarted = true
      setup()
    } else {
      timer.stop()
    }

    // We must persist React events if we want to keep them around
    if (event.persist) event.persist()

    // Add to the stack of evevents in the state
    state.events.push(event)

    // handleEvent
    let isFinished = handleEvent(event)
    if (event.type === 'timeout') {
      isFinished = true
    }

    console.log({ isStarted: state.isStarted, isFinished })

    // If we aren't finished, we need to restart the timeout `timer`.
    // If we are finished, we set a flag that we haven't started an action
    // and to run all the `handler.onTeardown` methods
    if (!isFinished) {
      timer.start()
    } else {
      state.isStarted = false
      teardown()
      debug('----- FINISH -->')
    }
  }

  /**
   * Handle the case where the Timer fires.
   *
   * It's just like a regular `trigger` except we give it a custom event
   * with type `timeout`. This lets us handle the `timeout` just like any
   * other trigger.
   */

  function timeout() {
    debug('----- TIMEOUT --')
    const event = { type: 'timeout' }

    trigger(event)
  }

  function mutate(mutationList) {
    const mutations = Array.from(mutationList)
    console.log('mutations', mutations)
    state.mutations.push(...mutations)
  }

  return { trigger, mutate }
}

export default ActionManager
