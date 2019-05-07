import Debug from 'debug'
import invariant from 'tiny-invariant'
// import { logEvent } from './action-manager-logger'
import logEvent from './log-event'

const debug = Debug('slate:action-manager')

function isFunction(fn) {
  return fn && {}.toString.call(fn) === '[object Function]'
}

function ActionManager(options, handlers) {
  invariant(typeof options === 'object')
  invariant(Array.isArray(handlers))

  const manager = { trigger, refresh, setDelay }

  options.manager = manager

  /**
   * Create sets of handlers to improve efficiency of when iterating over
   * them
   */

  const setupHandlers = handlers.filter(handler => handler.onSetup)
  const teardownHandlers = handlers.filter(handler => handler.onTeardown)
  const triggerHandlers = handlers.filter(handler => handler.onTrigger)
  const finishHandlers = handlers.filter(handler => handler.onFinish)

  /**
   * Array of events associated with this action. Events are cleared after
   * every action.
   */

  const events = []

  /**
   * The id for the currently runner `setTimeout`
   */

  let timeoutId = null

  /**
   * Has a trigger been fired for this action?
   *
   * Some events will call `refresh` like `onSelect` instead of `trigger`.
   * If an action consists only of `refresh` calls, it should not do any
   * matching on finish. That only happens when there is at least one trigger.
   *
   * We use `isTriggered` to keep track of this.
   */

  let isTriggered = false

  /**
   * Is the action finished? If so, it means the next trigger is the first
   * event in the action and we need to run all the `onSetup` handlers.
   */

  let isFinished = true

  /**
   * Is the current action handled already
   */

  let isActionHandled = false

  /**
   * If the action was handled during the trigger phase and it returned a
   * function, then we execute the returned function
   */

  let finishHandler = null
  let finishName = null

  // let delay = null

  /**
   * Call all `onSetup` handlers
   */

  function setup() {
    setupHandlers.forEach(handler => handler.onSetup(options))
  }

  /**
   * Call all `onTeardown` handlers
   */

  function teardown() {
    options.isActionHandled = isActionHandled
    teardownHandlers.forEach(handler => handler.onTeardown(options))
  }

  /**
   * Refresh the timeout by clearing the existing one and setting a new one.
   * This pushes the timeout to make sure that the `setTimeout` or
   * `requestAnimationFrame` doesn't get called in the middle of an action.
   *
   * WARNING:
   * You may feel compelled to reduce the `setTimeout` to use
   * `requestAnimationFrame`. You will want to do this because:
   *
   * - It feels like making this on `requestAnimationFrame` will make this
   *   more responsive. In practice, it's fast enough.
   * - It feels like
   */

  function refresh(event, editor) {
    options.editor = editor
    // optionalDelay
    // if (optionalDelay != null) delay = optionalDelay
    // cancelAnimationFrame(timeoutId)
    clearTimeout(timeoutId)
    // if (delay == null) {
    //   console.log(1)
    //   timeoutId = requestAnimationFrame(finish)
    // } else {
    // console.log(2)
    // timeoutId = setTimeout(finish, delay)
    timeoutId = setTimeout(finish, delay)
    // }
    // console.log(3)

    // clearTimeout(timeoutId)
    // // IMPORTANT!
    // // If the timeout value is set to `0` (or very low) inserting the text
    // // `It is. No.` will end up with the `.` missing.
    // //
    // // The scenario plays out when you try to reconcile the `.` too quickly.
    // // Then Android reacts to this DOM change which (I'm guessing) it thinks
    // // over-rode what Android thought it was trying to do.
    // //
    // // It then tries to delete the `No` word and re-insert the `.`.
    // timeoutId = setTimeout(finish)
  }

  const defaultDelay = 0

  let delay = defaultDelay

  function setDelay(argDelay) {
    delay = argDelay
  }

  /**
   * Resets the events associated with the current action. Usually called when
   * the the action is `finish`ed.
   */

  function reset() {
    events.length = 0
    delay = defaultDelay
    isTriggered = false
    isActionHandled = false
    finishHandler = null
    finishName = null
    isFinished = true
    teardown()
  }

  /**
   * Trigger an event and handle it.
   *
   * @param {Event} event
   */

  function trigger(event, editor) {
    invariant(editor, 'Remember to pass in the editor')

    // Mark this action as `isTriggered`
    isTriggered = true

    // add the `editor` to options
    options.editor = editor

    // Refresh the `setTimeout` to make sure it doesn't fire in the middle of
    // an action.
    refresh(event, editor)

    // If this is the first first event for the action (i.e. the first event
    // called when `isFinished` is true) then run all the setup handlers and
    // set `isfinished` to false
    if (isFinished) {
      setup()
      isFinished = false
    }

    // We log here so that the `setup` logging can be displayed first.
    // logEvent(event)

    // If the action is already handled, we can ignore the event. We don't need
    // to pay attention until a new action starts again.
    if (isActionHandled) return

    // If the event is a React event, we need to persist it
    if (event.persist) event.persist()

    // save the events
    events.push(event)

    // Find the correct handler for this action if any
    const handler = triggerHandlers.find(handler => {
      const result = handler.onTrigger(event, options, events)
      // If the result of the handler's `onTrigger` is a function, then that
      // function needs to be called during the `finish` phase. This function
      // is called the `finishHandler`
      if (isFunction(result)) {
        finishHandler = result
        finishName = handler.name
      }
      return result
    })

    // If there is no matching handler, quit
    if (handler == null) return

    if (finishHandler) {
      // Mark action as handled
      isActionHandled = true
    } else {
      reset()
    }
  }

  /**
   * When an action is finished (i.e. all the events related to the action have
   * fired) we will check to see if it matches. If it does, we want to handle
   * the action.
   */

  function finish() {
    debug(`finish`)

    if (!isTriggered) {
      debug(`finish:untriggered`)
      reset()
      return
    }

    // If the action was handled in an `onTrigger`, reset and quit
    if (isActionHandled) {
      if (finishHandler) {
        debug(`finish:trigger:${finishName}`)
        const result = finishHandler()
        if (typeof result === 'function') {
          debug(`finish:push:${finishName}`)
          finishHandler = result
          return
        }
      }
      reset()
      return
    }

    // Find first handler that returns true then don't run anymore
    const action = finishHandlers.find(handler =>
      handler.onFinish(events, options)
    )

    // Debug the
    if (action == null) {
      debug(`finish:no-reaction`)
    } else {
      isActionHandled = true
      debug(`finish:${action.name}`)
    }

    // Run teardown handlers and reset state
    reset()
  }

  return manager
}

export default ActionManager
