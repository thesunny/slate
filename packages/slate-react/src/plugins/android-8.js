import Debug from 'debug'
import getWindow from 'get-window'

import fixSelectionInZeroWidthBlock from '../utils/fix-selection-in-zero-width-block'
import ActionManager from '../utils/action-manager'
import DomSnapshot from '../utils/dom-snapshot'
import Reconciler from '../utils/reconciler'
import actionManagerLogger from '../utils/action-manager-logger'
import isInputDataEnter from '../utils/is-input-data-enter'

const debug = Debug('slate:android')
debug.reconcile = Debug('slate:reconcile')

/**
 * Define variables related to composition state.
 */

const NONE = 0
const COMPOSING = 1

function Android8Plugin() {
  const actionManager = new ActionManager({}, [
    actionManagerLogger,
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
            // Setup the updater by clearing it and adding the current cursor position
            // as the first node to look at.
            reconciler.clear()
            reconciler.addNode()
            return
          case 'input':
            if (status === COMPOSING) {
              reconciler.addNode()
            }
            return
          case 'compositionupdate':
            reconciler.addNow()
            return
          case 'compositionend':
            return
        }
      },
    },
    /**
     * Handle `enter-edge-of-word`.
     *
     * In Android 8, we can't `preventDefault` on the `Enter` key. We have to
     * let it happen, revert to snapshot, then take care of it by calling
     * `splitBlock`
     *
     * - compositionend
     * - keydown "Unidentified"
     * - input:deleteContentBackward
     * - keydown "Enter"
     * - textInput "\n"
     * - input:insertLineBreak
     * - keydown "Unidentified"
     * - compositionstart
     * - input:insertCompositionText "before"
     */
    {
      name: 'enter-word-edge',
      onTrigger(event, { editor }) {
        if (event.type !== 'keydown') return
        if (event.key !== 'Enter') return
        return () => {
          const selection = snapshot.apply(editor)
          reconciler.apply(window, editor, {
            from: 'enter-edge-of-word',
            selection,
          })
          editor.splitBlock()
        }
      },
    },
    /**
     * Handle `enter-middle-of-word`
     *
     * Hitting `enter` in the middle of a word has a different signature
     * than hitting `enter` at the edge of a word.
     *
     * Signature (middle of word "middle")
     *
     * - compositionend
     * - keydown "Unidentified"
     * - input:deleteContentBackward
     * - input:delteContentBackward
     * - keydown "Unidentified"
     * - textInput "mid\n"
     * - input:insertText "mid"
     * - input:insertText null
     * - keydown "Unidentified"
     * - compositionstart
     * - input:insertCompositionText "dle"
     */
    {
      name: 'enter-middle-of-word',
      onTrigger(event, { editor }) {
        if (event.type !== 'textInput') return
        const isEnter = isInputDataEnter(event.data)
        if (!isEnter) return
        return () => {
          const selection = snapshot.apply(editor)
          reconciler.apply(window, editor, {
            from: 'enter-middle-of-word',
            selection,
          })
          editor.splitBlock()
        }
      },
    },
    /**
     * Handle `composition-end-space`
     *
     * Press `space` at `mid|dle`
     *
     * - compositionend
     * - keydown                   "Unidentified"
     * - input:deleteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - textInput "mid "
     * - input:insertText "mid "
     * - keydown "Unidentified"
     * - compositionstart
     * - input:insertCompositionText "dle"
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
          event => event.type === 'compositionend'
        )
        if (!compositionEndEvent) return
        const spaceEvent = events.find(event => {
          return (
            event.type === 'textInput' && event.nativeEvent.data.endsWith(' ')
          )
        })
        if (!spaceEvent) return
        reconciler.addNode()
        const selection = snapshot.apply(editor)
        reconciler.apply(window, editor, {
          from: 'composition-end-space',
          selection,
        })
        editor.insertText(' ')
        return true
      },
    },
    /**
     * Handle `edit-suggestion`
     *
     * Example signature change `is` to `isn't`
     *
     * - compositionend
     * - keydown
     * - input:deleteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - textInput "isn't"
     * - input:insertText "isn't"
     * - keydown "Unidentified"
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
        // NOTE: Android8 requires `addNode` while `Android9` does not.
        reconciler.addNode()
        reconciler.apply(window, editor, { from: 'edit-suggestion' })
        return true
      },
    },
    /**
     * Handle `insert-suggestion-or-space-or-punctuation`
     *
     * Select edit suggestion. Change `it` to `it's`
     *
     * - compositionend
     * - keydown "Unidentified"
     * - input:deleteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - textInput "It's"
     *
     * Type `It me. No.`. Should not delete the last `.`
     *
     * compositionend
     * keydown "Unidentified"
     * textInput "."
     * input:insertText "."
     * keydown "Unidentified"
     * input:deleteContentBackward
     * input:deleteContentBackward
     * keydown "Unidentified"
     * compositionstart
     * input:insertCompositionText "No."
     */
    {
      name: 'insert-suggestion-or-space-or-punctuation',
      onTrigger(event, { editor }) {
        if (event.type !== 'textInput') return
        if (status === NONE) return
        reconciler.addNode()
        return function() {
          reconciler.apply(window, editor, {
            from: 'insert-suggestion-or-space-or-punctuation',
          })
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
     * ## Type at end of word
     *
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
     * ## Two Gestures
     *
     * Handle two gestures with an implied space
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
     * - keydown "Unidentified"
     * - beforeinput:insertText " "
     * - textInput " "
     * - input:insertText " "
     * - keydown "Unidentified"
     * - beforeinput:insertCompositionText "there"
     * - input:insertCompositionText "there"
     *
     * Then:
     *
     * - compositionend
     */
    {
      name: 'default-composition-end',
      onFinish(events, { editor }) {
        const compositionEndEvent = events.find(event => {
          return event.type === 'compositionend'
        })
        if (!compositionEndEvent) return
        status = NONE
        reconciler.apply(window, editor, { from: 'default-composition-end' })
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
   * Reconciler object to reconcile the DOM to Slate's internal Value.
   */

  let reconciler = new Reconciler()

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
    debug('onBeforeInputNative')
    actionManager.trigger(event, editor)
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
    debug('onCompositionEnd')
    actionManager.trigger(event, editor)
  }

  /**
   * On composition start.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onCompositionStart(event, editor, next) {
    debug('onCompositionStart')
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
    debug('onCompositionUpdate')
  }

  /**
   * Handle `input` event.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onInput(event, editor, next) {
    debug('onInput')
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
    debug('onKeyDown')
    actionManager.trigger(event, editor)
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

export default Android8Plugin
