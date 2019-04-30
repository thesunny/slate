import Debug from 'debug'
import getWindow from 'get-window'
import pick from 'lodash/pick'

import fixSelectionInZeroWidthBlock from '../utils/fix-selection-in-zero-width-block'
import isInputDataLastChar from '../utils/is-input-data-last-char'
import setSelectionFromDom from '../utils/set-selection-from-dom'
import setTextFromDomNode from '../utils/set-text-from-dom-node'
import ActionManager from '../utils/action-manager'
import DomSnapshot from '../utils/dom-snapshot'
import DelayedExecutor from '../utils/executor'
import Reconciler from '../utils/reconciler'

const debug = Debug('slate:android')
debug.reconcile = Debug('slate:reconcile')

/**
 * Define variables related to composition state.
 */

const NONE = 0
const COMPOSING = 1

function logTrigger(type, subtype, data) {
  const fullType = subtype ? `${type}:${subtype}` : type
  console.log('TRIGGER', fullType, JSON.stringify(data))
}

function Android9Plugin() {
  debug('initializing Android9Plugin')

  const actionManager = new ActionManager({}, [
    {
      name: 'log',
      onSetup() {
        console.log('<===== SETUP ==')
      },
      onTeardown() {
        console.log('====== TEARDOWN ==>')
      },
      onTrigger(event) {
        switch (event.type) {
          case 'keydown':
            logTrigger(event.type, null, event.key)
            return
          case 'input':
            logTrigger(
              event.type,
              event.nativeEvent.inputType,
              event.nativeEvent.data
            )
            return
          case 'beforeinput':
            logTrigger(event.type, event.inputType, event.data)
            return
          case 'textInput':
            logTrigger(
              event.type,
              event.nativeEvent.inputType,
              event.nativeEvent.data
            )
            return
        }
        logTrigger(event.type)
      },
      onFinish() {
        console.log('FINISH')
      },
    },
    /**
     * Take a snapshot of the DOM before we do anything. This is so that we
     * can revert from the Android events where `preventDefault` does not work.
     */
    {
      name: 'snapshot',
      onSetup({ editor }) {
        snapshot = new DomSnapshot(window, editor, {
          before: true,
        })
      },
    },
    /**
     * Handle compositions
     *
     * Test case:
     *
     * Go to the end of a word like `it` and then type `s` then click outside
     * the editor. Slate's value should reflect `its`
     */
    {
      name: 'composition-updates',
      onTrigger(event) {
        switch (event.type) {
          case 'compositionstart':
            status = COMPOSING
            nodes.clear()

            // Setup the updater by clearing it and adding the current cursor position
            // as the first node to look at.
            updater.clear()
            const { anchorNode } = window.getSelection()
            updater.addNode(anchorNode)
            return
          case 'input':
            {
              if (status === COMPOSING) {
                const { anchorNode } = window.getSelection()
                nodes.add(anchorNode)
              }
            }
            return
          case 'compositionupdate':
            {
              // Add current node to the updater
              const { anchorNode } = window.getSelection()
              updater.addNode(anchorNode)
            }
            return
          case 'compositionend':
            return
        }
      },
    },
    /**
     * Handle `enter`.
     *
     * When enter is detected, we are able to `preventDefault` on the event.
     * We wait until the action completes before we `reconcile` the edit then
     * call `splitBlock`.
     *
     * - compositionend
     * - keydown : "Unidentified"
     * - keydown : "Enter"
     */
    {
      name: 'enter',
      onTrigger(event, { editor }) {
        if (event.type !== 'keydown') return
        if (event.key !== 'Enter') return
        event.preventDefault()
        if (reconciler) reconciler.cancel()
        if (deleter) deleter.cancel()
        return () => {
          reconcile(window, editor, { from: 'onKeyDown:enter' })
          editor.splitBlock()
        }
      },
    },
    /**
     * Handle `composition-end-space`
     *
     * - compositionend
     * - keydown                   "Unidentified"
     * - beforeinput : insertText  " "
     * - textInput                 " "
     * - input       : insertText  " "
     *
     * The composition-end-space happens when you explicitly press the space
     * bar. It differs from an implicit space when you enter two suggestions
     * one after the other.
     *
     * NOTE:
     * We cannot match in `onTrigger` because the `compositionEnd` must be
     * matched to disambiguate from the implicit space.
     */
    {
      name: 'composition-end-space',
      onFinish(events, { editor }) {
        const compositionEndEvent = events.find(
          event => event.type === 'compositionEnd'
        )
        if (!compositionEndEvent) return
        const spaceEvent = events.find(
          event => event.type === 'textInput' && event.nativeEvent.data === ' '
        )
        if (!spaceEvent) return
        const { anchorNode } = window.getSelection()
        nodes.add(anchorNode)
        const selection = snapshot.apply(editor)
        reconcile(window, editor, { from: 'composition-end-space', selection })
        editor.insertText(' ')
      },
    },
    /**
     * Handle `instant-composition`
     *
     * Some compositions like
     */
    {
      name: 'instant-composition',
    },
    /**
     * Handle `edit-suggestion`
     *
     * Example signature
     *
     * - compositionend
     * - keydown
     * - beforeinput : deleteContentBackward
     * - input       : deleteContentBackward
     * - beforeinput : deleteContentBackward
     * - input       : deleteContentBackward
     * - keydown
     * - beforeinput : insertText "Middletown"
     * - textInput "Middletown"
     * - input       : insertText "Middletown"
     * - keydown
     *
     * To disambiguate from `backspace` we look for a backspace and a
     * `textInput`
     */
    {
      name: 'edit-suggestion',
      onFinish(events, { editor }) {
        const deleteEvent = events.find(event => {
          if (event.type !== 'input') return
          if (event.nativeEvent.inputType !== 'deleteContentBackward') return
          return true
        })
        if (deleteEvent == null) return
        // TODO:
        // We can start searching after the earlier find instead of searching
        // all the events from scratch again.
        const textinputEvent = events.find(event => event.type === 'textInput')
        if (textinputEvent == null) return
        reconcile(window, editor, { from: 'suggestion' })
        return true
      },
    },
    /**
     * Handle `period-at-end-of-composition-sometimes`
     *
     * This requires a very specific set of circumstances. Type on a new line
     * `It is. No.` and the `.` will disappear. Does not happen with a comma.
     *
     * Sometimes it can happen at beginning of line if you type `It.` only when
     * the `It` is underlined while typing and it doesn't always happen.
     *
     * It fires two `actions` (i.e. separated by enough time to trigger two
     * clock ticks on `setTimeout` or `requestAnimationFrame`).
     *
     * - compositionend
     * - keydown "Unidentified"
     * - beforeinput:insertText "."
     * - textInput "."
     *
     * Followed by:
     *
     * - keydown "Unidentified"
     * - beforeinput:deleteContentBackward
     * - input:deleteContentBackward
     * - beforeinput:delteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - compositionstart
     * - beforeinput:insertCompositionText "No."
     * - input:insertCompositionText "No."
     */
    {
      name: 'insert-period-at-end-of-line',
      onTrigger(event, options) {
        if (event.type !== 'beforeinput') return
        if (event.data !== '.') return
        const { editor } = options
        return function() {
          reconcile(window, editor, {
            from: 'insert-period-at-end-of-line',
          })
        }
      },
    },
    /**
     * Handle `insert-suggestion-or-punctuation`
     *
     * Example signature
     *
     * - keydown
     * - beforeinput:insertText "School"
     * - textInput "School"
     * - input:insertText "School"
     *
     * WORKING ON THIS! There is no `textInput` on the composition based
     * inputs. A good way to disambiguate. We could potentially disambiguate by
     * looking to see if we are in a composition as well but test to see if
     * this is true.
     *
     */
    {
      name: 'insert-suggestion-or-space-or-punctuation',
      onTrigger(event, { editor }) {
        if (event.type !== 'textInput') return
        if (status === NONE) return
        const { anchorNode } = window.getSelection()
        nodes.add(anchorNode)
        return function() {
          reconcile(window, editor, {
            from: 'insert-suggestion-or-space-or-punctuation',
          })
          // setTimeout(() => {
          //   console.log(
          //     'one tick after insert-suggestion-or-space-or-punctuation'
          //   )
          // })
        }
      },
    },
    /**
     * Handle `continuous-backspace`
     *
     * - compositionend
     * - keydown "Unidentified"
     * - beforeinput:deleteContentBackward
     * - input:deleteContentBackward
     */
    {
      name: 'continuous-backspace',
      onFinish(events, { editor }) {
        // Find the number of matching delete events
        const deleteEvents = events.filter(event => {
          return (
            event.type === 'input' &&
            event.nativeEvent.inputType === 'deleteContentBackward'
          )
        })
        // If we can't find any deletes then return
        if (deleteEvents.length === 0) return
        // revert to before the deletes started
        snapshot.apply(editor)
        // delete the same number of times that Android told us it did
        editor.deleteBackward(deleteEvents.length)
        return true
      },
    },
    /**
     * Handle two gestures
     *
     * Signature for "hello" "there" (no typed space)
     *
     * - keydown "Unidentified"
     * - compositionstart
     * - beforeinput:insertCompositionText "Hello"
     * - input:insertCompositionText "Hello"
     *
     * Then:
     *
     * - compositionend
     * - TEARDOWN/SETUP
     * - keydown "Unidentified"
     * - beforeinput:insertText " "
     * - textInput " "
     *
     */
    /**
     * Handle `period-at-end-of-composition-sometimes`
     *
     * This requires a very specific set of circumstances. Type on a new line
     * `It is. No.` and the `.` will disappear. Does not happen with a comma.
     *
     * Sometimes it can happen at beginning of line if you type `It.` only when
     * the `It` is underlined while typing and it doesn't always happen.
     *
     * It fires two `actions` (i.e. separated by enough time to trigger two
     * clock ticks on `setTimeout` or `requestAnimationFrame`).
     *
     * - compositionend
     * - keydown "Unidentified"
     * - beforeinput:insertText "."
     * - textInput "."
     *
     * Followed by:
     *
     * - keydown "Unidentified"
     * - beforeinput:deleteContentBackward
     * - input:deleteContentBackward
     * - beforeinput:delteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - compositionstart
     * - beforeinput:insertCompositionText "No."
     * - input:insertCompositionText "No."
     */
    // THIS IS CRASHING IN `after` enter enter backspace backspace
    // {
    //   name: 'insert-period-at-end-of-line',
    //   onTrigger(event, { editor }) {
    //     if (event.type !== 'input') return
    //     if (status == COMPOSING) return

    //     const { anchorNode } = window.getSelection()
    //     nodes.add(anchorNode)

    //     return function() {
    //       reconcile(window, editor, { from: 'none-composition-input' })
    //     }
    //   },
    // },
    /**
     * Signature of typing on end of word followed by signature of composition
     *
     * Typing at end of word "it" with an "s" signature:
     *
     * NOTE: We don't want this to trigger the `insert-suggestion`
     *
     * - keydown
     * - beforeinput:insertCompositionText "its"
     * - input:insertCompositionText "its"
     *
     * Blur signature
     *
     * - compositionend
     *
     */
    {
      name: 'default-composition-end',
      onFinish(events, { editor }) {
        const compositionEndEvent = events.find(event => {
          return event.type === 'compositionend'
        })
        if (!compositionEndEvent) return
        status = NONE
        reconcile(window, editor, { from: 'default-composition-end' })
        return true
      },
    },
  ])

  /**
   * The current state of composition.
   *
   * @type {NONE|COMPOSING|WAITING}
   */

  let status = NONE

  /**
   * The set of nodes that we need to process when we next reconcile.
   * Usually this is soon after the `onCompositionEnd` event.
   *
   * @type {Set} set containing Node objects
   */

  const nodes = new window.Set()

  /**
   * When there is a `compositionEnd` we ened to reconcile Slate's Document
   * with the DOM. The `reconciler` is an instance of `Executor` that does
   * this for us. It is created on every `compositionEnd` and executes on the
   * next `requestAnimationFrame`. The `DelayedExecutor` can be cancelled and resumed
   * which some methods do.
   *
   * @type {DelayedExecutor}
   */

  let reconciler = null

  let updater = new Reconciler()

  /**
   * A snapshot that gets taken when there is a `keydown` event in API26/27.
   * If an `input` gets called with `inputType` of `deleteContentBackward`
   * we need to undo the delete that Android does to keep React in sync with
   * the DOM.
   *
   * @type {DomSnapshot}
   */

  let snapshot = null

  /**
   * The deleter is an instace of `DelayedExecutor` that will execute a delete
   * operation on the next `requestAnimationFrame`. It has to wait because
   * we need Android to finish all of its DOM operations to do with deletion
   * before we revert them to a Snapshot. After reverting, we then execute
   * Slate's version of delete.
   *
   * @type {DelayedExecutor}
   */

  let deleter = null

  /**
   * Because Slate implements its own event handler for `beforeInput` in
   * addition to React's version, we actually get two. If we cancel the
   * first native version, the React one will still fire. We set this to
   * `true` if we don't want that to happen. Remember that when we prevent it,
   * we need to tell React to `preventDefault` so the event doesn't continue
   * through React's event system.
   *
   * type {Boolean}
   */

  let preventNextBeforeInput = false

  /**
   * When a composition ends, in some API versions we may need to know what we
   * have learned so far about the composition and what we want to do because of
   * some actions that may come later.
   *
   * For example in API 26/27, if we get a `beforeInput` that tells us that the
   * input was a `.`, then we want the reconcile to happen even if there are
   * `onInput:delete` events that follow. In this case, we would set
   * `compositionEndAction` to `period`. During the `onInput` we would check if
   * the `compositionEndAction` says `period` and if so we would not start the
   * `delete` action.
   *
   * @type {(String|null)}
   */

  let compositionEndAction = null

  /**
   * Looks at the `nodes` we have collected, usually the things we have edited
   * during the course of a composition, and then updates Slate's internal
   * Document based on the text values in these DOM nodes and also updates
   * Slate's Selection based on the current cursor position in the Editor.
   *
   * @param {Window} window
   * @param {Editor} editor
   * @param {String} options.from - where reconcile was called from for debug
   */

  function reconcile(window, editor, { from, selection }) {
    console.log('reconcile', { from, selection })

    // WARNING:
    // Putting `nodes.add(anchorNode)` here will break reconciliation if you are
    // reverting to a snapshot immediately before. The likely cause is the
    // selection is in the wrong place.

    debug.reconcile({ from })
    const domSelection = window.getSelection()

    nodes.forEach(node => {
      setTextFromDomNode(window, editor, node)
    })

    if (selection) {
      editor.select(selection)
    } else {
      setSelectionFromDom(window, editor, domSelection)
    }
    nodes.clear()
  }

  /**
   * Triage `beforeinput` and `textinput`.
   *
   * Handles `onBeforeInput` so that the native event goes to
   * `onBeforeInputNative` and React's event which is `textInput` goes to
   * `onTextInput`
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onBeforeInput(event, editor, next) {
    const isNative = !event.nativeEvent
    if (isNative) {
      onBeforeInputNative(event, editor, next)
    } else {
      onTextInput(event, editor, next)
    }
  }

  /**
   * Handle `beforeinput` event
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {function} next
   */

  function onBeforeInputNative(event, editor, next) {
    debug('onBeforeInputNative', {
      event,
      status,
      e: pick(event, ['data', 'isComposing']),
    })
    actionManager.trigger(event, editor)

    // If a `beforeInput` event fires after an `input:deleteContentBackward`
    // event, it appears to be a good indicator that it is some sort of
    // special combined Android event. If this is the case, then we don't
    // want to have a deletion to happen, we just want to wait until Android
    // has done its thing and then at the end we just want to reconcile.
    if (deleter) {
      debug('onBeforeInputNative', 'cancelled deleter')
      deleter.cancel()
      reconciler.resume()
    }
  }

  /**
   * Handle `textinput` event
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {function} next
   */

  function onTextInput(event, editor, next) {
    debug('onTextInput')
    actionManager.trigger(event, editor)
  }

  /**
   * On Composition end. By default, when a `compositionEnd` event happens,
   * we start a reconciler. The reconciler will update Slate's Document using
   * the DOM as the source of truth. In some cases, the reconciler needs to
   * be cancelled and can also be resumed. For example, when a delete
   * immediately follows a `compositionEnd`, we don't want to reconcile.
   * Instead, we want the `delete` to take precedence.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onCompositionEnd(event, editor, next) {
    debug('onCompositionEnd', { event })
    actionManager.trigger(event, editor)

    // const window = getWindow(event.target)
    // const domSelection = window.getSelection()
    // const { anchorNode } = domSelection

    // compositionEndAction = 'reconcile'
    // nodes.add(anchorNode)

    // reconciler = new DelayedExecutor(window, () => {
    //   status = NONE
    //   reconcile(window, editor, { from: 'onCompositionEnd:reconciler' })
    //   compositionEndAction = null
    // })
  }

  /**
   * On composition start.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onCompositionStart(event, editor, next) {
    debug('onCompositionStart', { event })

    actionManager.trigger(event, editor)
  }

  /**
   * On composition update.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onCompositionUpdate(event, editor, next) {
    actionManager.trigger(event, editor)
    debug('onCompositionUpdate', { event })
  }

  /**
   * Handle `input` event.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onInput(event, editor, next) {
    debug('onInput', {
      event,
      status,
      e: pick(event, ['data', 'nativeEvent', 'inputType', 'isComposing']),
    })
    actionManager.trigger(event, editor)
  }

  /**
   * On key down.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onKeyDown(event, editor, next) {
    debug('onKeyDown', {
      event,
      status,
      e: pick(event, [
        'char',
        'charCode',
        'code',
        'key',
        'keyCode',
        'keyIdentifier',
        'keyLocation',
        'location',
        'nativeEvent',
        'which',
      ]),
    })
    actionManager.trigger(event, editor)

    const window = getWindow(event.target)

    // if (event.key === 'Enter') {
    //   debug('onKeyDown:enter')
    //   event.preventDefault()
    //   if (reconciler) reconciler.cancel()
    //   if (deleter) deleter.cancel()

    //   window.requestAnimationFrame(() => {
    //     reconcile(window, editor, { from: 'onKeyDown:enter' })
    //     editor.splitBlock()
    //   })
    //   return
    // }

    // // We need to take a snapshot of the current selection and the
    // // element before when the user hits the backspace key. This is because
    // // we only know if the user hit backspace if the `onInput` event that
    // // follows has an `inputType` of `deleteContentBackward`. At that time
    // // it's too late to stop the event.
    // keyDownSnapshot = new DomSnapshot(window, editor, {
    //   before: true,
    // })

    // debug('onKeyDown:snapshot', { keyDownSnapshot })
  }

  /**
   * On select.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   */

  function onSelect(event, editor, next) {
    debug('onSelect', { event, status })

    const window = getWindow(event.target)
    fixSelectionInZeroWidthBlock(window)
  }

  /**
   * Return the plugin.
   *
   * @type {Object}
   */

  return {
    onBeforeInput,
    onCompositionEnd,
    onCompositionStart,
    onCompositionUpdate,
    onInput,
    onKeyDown,
    onSelect,
  }
}

/**
 * Export.
 *
 * @type {Function}
 */

export default Android9Plugin
