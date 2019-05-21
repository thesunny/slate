import Debug from 'debug'
import invariant from 'tiny-invariant'
import Timer from './timer'
import stringifyEvent from '../debug/stringify-event'

const debug = Debug('slate:action-manager')

function ActionManager(handlers) {
  /**
   * Pre-filter handlers for better performance
   */

  const filteredHandlers = {
    onSetup: handlers.filter(h => h.onSetup).map(h => h.onSetup),
    onTeardown: handlers.filter(h => h.onTeardown).map(h => h.onTeardown),
    onTrigger: handlers.filter(h => h.onTrigger).map(h => h.onTrigger),
    onTimeout: handlers.filter(h => h.onTimeout).map(h => h.onTimeout),
  }

  /**
   * Timer object that calls `timeout` method when timer runs out
   *
   * @type {Timer}
   */

  let timer = new Timer(timeout)

  /**
   * State Object
   */

  let state

  /**
   * Reset `state` to a copy of `INITIAL_STATE`
   *
   * Called in two places (1) at first use and (2) when we `finish`
   */

  function initializeState() {
    state = {
      isAction: false,
      editor: null, // Editor
      finisher: null, // object in form {onTrigger, onFinish}
      interval: 20,
      events: [],
      mutations: [],
    }
  }

  // initialize state before first use
  initializeState()

  /**
   * `start` is called immediately after the first `trigger`
   */

  function start() {
    debug('<== START ===')
    state.isAction = true
    console.log({ filteredHandlers })
    filteredHandlers.onSetup.forEach(h => h(state))
  }

  /**
   * `finish` is called when we have completed an `action`, either by
   * a handler returning true, a finisher returning true or the timeout firing
   */

  function finish(from) {
    filteredHandlers.onTeardown.forEach(h => h(state))
    debug('state before', state)
    // `initializeState` includes `state.action = false` to match `start`
    initializeState()
    debug('--- FINISH -->')
    debug('state after', state)
  }

  /**
   * Matches using the current finisher for the given type.
   *
   * @param {string} type
   * @param {object} options
   */

  function matchFinisher(type, options) {
    const fn = state.finisher[type]
    // if there is no method for this finisher's type, return false
    if (fn == null) return false
    const match = fn(options)
    if (match) {
      debug(`match finisher during ${type}`, match, options)
    }
    return match
  }

  /**
   * Matches using the handlers for the given type
   *
   * @param {string} type
   * @param {object} options
   */

  function matchHandler(type, options) {
    let match = false
    const handler = filteredHandlers[type].find(handler => {
      match = handler(options)
      return match
    })
    if (match) {
      const when =
        type === 'onTrigger' ? stringifyEvent(options.event) : 'timeout'
      debug(`--- MATCH ${handler.name} (${when})`, match, options)
    }
    return match
  }

  /**
   * Matches finisher and handlers for given type
   *
   * @param {string} type
   * @param {object} options
   */

  function matchByType(type, options) {
    return state.finisher
      ? matchFinisher(type, options)
      : matchHandler(type, options)
  }

  /**
   * Trigger event
   *
   * @param {Event} event
   * @param {Editor} editor
   */

  function trigger(event, editor) {
    invariant(editor, 'editor is required')

    // add editor to state (keep before `start`)
    state.editor = editor

    timer.stop()

    if (!state.isAction) {
      state.isAction = true
      start()
    }

    // If the event is a React event, persist it (i.e. do not reuse)
    if (event.persist) event.persist()

    // save the event
    state.events.push(event)

    // get a matcing result from the trigger
    const match = matchByType('onTrigger', { event, ...state })

    if (match === false) {
      // the event doesn't match, restart the timer so that timeout can fire.
      timer.start()
    } else if (match === true) {
      // If `match === true` the handler handled the `event` immediately.
      finish(`trigger`)
    } else if (typeof match === 'object') {
      // If the match is an `object` then we are declaring that the event matches
      // but that we aren't finished the action. That match `object` is in the
      // form of `{onTrigger, onTimeout}`.
      //
      // The action is finished on the earlier of:
      //
      // - a timeout at which time `match.onTimeout` is called.
      // - a trigger matches `match.onTrigger` which can itself return
      //   an `object` which would follow the same rules.
      state.finisher = result
      timer.start()
    } else {
      throw new Error(`Don't know how to handle result ${match}`)
    }
  }

  /**
   * Handle the timeout
   */

  function timeout() {
    matchByType('onTimeout', state)
    finish('timeout')
  }

  return { trigger }
}

export default ActionManager
