import Debug from 'debug'
import getWindow from 'get-window'
import pick from 'lodash/pick'

import fixSelectionInZeroWidthBlock from '../utils/fix-selection-in-zero-width-block'
import getSelectionFromDOM from '../utils/get-selection-from-dom'
import isInputDataLastChar from '../utils/is-input-data-last-char'
import setSelectionFromDom from '../utils/set-selection-from-dom'
import setTextFromDomNode from '../utils/set-text-from-dom-node'
import ActionManager from '../utils/action-manager'
import DomSnapshot from '../utils/dom-snapshot'
import DelayedExecutor from '../utils/executor'
import Reconciler from '../utils/reconciler'
import actionManagerLogger from '../utils/action-manager-logger'

const debug = Debug('slate:android')
debug.reconcile = Debug('slate:reconcile')

/**
 * Define variables related to composition state.
 */

const NONE = 0
const COMPOSING = 1

function Android9Plugin() {
  /**
   * The select manager handles the creation of the `lastSelection`.
   *
   * We need it because when we delete a selection that is not collapsed,
   * Android collapses it before we can read its proper size.
   *
   * So during delete, we always need access to `lastSelection`
   *
   * WARNING:
   * Dont't add an `onSelect` trigger to `actionManager`. Because of when
   * and how often `onSelect` triggers (and I have to admit, I'm not entirely
   * sure what specific things causes the issue) the quick `backspace` actions
   * often mess up the DOM.
   */
  // const selectManager = new ActionManager({}, [
  //   {
  //     name: 'last-select-in-select-manager',
  //     onTeardown({ editor }) {
  //       lastSelection = getSelectionFromDOM(
  //         window,
  //         editor,
  //         window.getSelection()
  //       )
  //     },
  //   },
  // ])
  const actionManager = new ActionManager({}, [
    actionManagerLogger,
    // {
    //   name: 'last-select-inaction-manager',
    //   onTeardown({ editor }) {
    //     lastSelection = getSelectionFromDOM(
    //       window,
    //       editor,
    //       window.getSelection()
    //     )
    //   },
    // },
    /**
     * Take a snapshot of the DOM before we do anything. This is so that we
     * can revert from the Android events where `preventDefault` does not work.
     */
    {
      name: 'snapshot',
      onSetup({ editor }) {
        // snapshot = new DomSnapshot(window, editor, {
        //   before: true,
        // })
      },
      onTeardown({ editor }) {
        // lastSelection = getSelectionFromDOM(
        //   window,
        //   editor,
        //   window.getSelection()
        // )
        // console.log('pre-snapshot')
        // editor.setState({}, () => {
        //   console.log('actual-snapshot')
        //   snapshot = new DomSnapshot(window, editor, {
        //     before: true,
        //   })
        // })
        // editor.forceUpdate(() => {
        //   console.log('actual-snapshot')
        //   snapshot = new DomSnapshot(window, editor, {
        //     before: true,
        //   })
        // })
        // console.log('onTeardown snapshot')
        // // requestAnimationFrame(() => {
        //   snapshot = new DomSnapshot(window, editor, {
        //     before: true,
        //   })
        // // })
        // console.log('onTeardown snapshot')
        requestAnimationFrame(() => {
          snapshot = new DomSnapshot(window, editor, {
            before: true,
          })
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
        reconciler.apply(window, editor, { from: 'onKeyDown:enter' })
        editor.splitBlock()
        return true
        // return () => {
        //   // reconciler.apply(window, editor, { from: 'onKeyDown:enter' })
        //   // editor.splitBlock()
        // }
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
    // {
    //   name: 'composition-end-space',
    //   onFinish(events, { editor }) {
    //     const compositionEndEvent = events.find(
    //       event => event.type === 'compositionEnd'
    //     )
    //     if (!compositionEndEvent) return
    //     const spaceEvent = events.find(
    //       event => event.type === 'textInput' && event.nativeEvent.data === ' '
    //     )
    //     if (!spaceEvent) return
    //     reconciler.addNode()
    //     const selection = snapshot.apply(editor)
    //     reconciler.apply(window, editor, {
    //       from: 'composition-end-space',
    //       selection,
    //     })
    //     editor.insertText(' ')
    //   },
    // },
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
        reconciler.apply(window, editor, { from: 'suggestion' })
        return true
      },
    },
    /**
     * Handle `insert-period-at-end-of-line`
     *
     * - compositionend
     * - keydown "Unidentified"
     * - beforeinput:insertText "."
     * - textInput "."
     *
     * This works by reconciling. It has the special need that the `reconciler`
     * be delayed by some time. We use 100ms. The delay code is in ActionManager
     * and if deleted will break this code here (there is a comment in
     * ActionManager on why there is a delay).
     *
     * It is triggered by typing `It is. No.` and the `.` (or more) will
     * disappear.
     *
     * If we fire `reconcile` too soon, we get a signature like this.
     *
     * - keydown "Unidentified"
     * - beforeinput:deleteContentBackward
     * - input:deleteContentBackward
     * - beforeinput:deleteContentBackward
     * - input:deleteContentBackward
     * - keydown "Unidentified"
     * - compositionstart
     * - beforeinput:insertCompositionText "No."
     * - input:insertCompositionText "No."
     *
     * Sometimes it can happen at beginning of line if you type `It.` only when
     * the `It` is underlined while typing and it doesn't always happen.
     */
    {
      name: 'insert-period-at-end-of-line',
      onTrigger(event, options) {
        if (event.type !== 'beforeinput') return
        if (event.data !== '.') return
        const { editor } = options
        // IMPORTANT!
        // Applying the reconciler must be done with an extended delay.
        // Otherwise, it will fail. Applying the reconciler too early
        // creates the second signature action above.
        return function() {
          return function() {
            reconciler.apply(window, editor, {
              from: 'insert-period-at-end-of-line',
            })
          }
        }
      },
    },
    /**
     * Handle `insert-suggestion-or-space-or-punctuation`
     *
     * Example signature
     *
     * - keydown
     * - beforeinput:insertText "School"
     * - textInput "School"
     * - input:insertText "School"
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
     * Handle `continuous-backspace-from-end-of-word`
     *
     * Deleting from end of `before it` to `befo`
     *
     * - keydown "Unidentified"
     * - input:insertCompositionText "i"
     * - keydown "Unidentified"
     * - input:insertCompositionText null
     * - compositionend
     * - keydown "Unidentified"
     * - input:delteContentBackward null
     * - keydown "Unidentified"
     * - input:insertCompositionText "befor"
     * - keydown "Unidentified"
     * - input:insertCompositionText "befo"
     */
    {
      name: 'continuous-backspace-from-middle-or-end-of-word-or-range',
      // onTrigger(event, { editor }) {
      //   if (event.type !== 'input') return
      //   if (
      //     !['deleteContentBackward', 'insertCompositionText'].includes(
      //       event.nativeEvent.inputType
      //     )
      //   )
      //     return
      //   // If we get a match, we want a longer delay before calling `onFinish`
      //   return 100
      // },
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

        // Count `insertCompositionText` events because if we start
        // backspacing at the end of the word, we get these mixed in instead
        // of `deleteContentBackward` (the `data` is remaining part of word).
        const insertCompositionEvents = events.filter(event => {
          return (
            event.type === 'input' &&
            event.nativeEvent.inputType === 'insertCompositionText'
          )
        })

        // revert to before the deletes started
        snapshot.apply(editor)

        /**
         * We select the `lastSelection` after applying the `snapshot`.
         * This is because even before the `snapshot` is taken (in the `onSetup`
         * phase), Android collapses the selection. So in the case of a
         * backspace, we rely on the selection from the previous action.
         */
        // if (lastSelection) editor.select(lastSelection)

        // The backspace count is the combination of `deleteContentBackward`
        // and `insertCompositionText` events we find.
        const backspaceCount =
          deleteEvents.length + insertCompositionEvents.length

        editor.deleteBackward(backspaceCount)
        // if (lastSelection == null || lastSelection.isCollapsed) {
        //   //   console.log(1)
        //   // If the `lastSelection` is collapsed, we `deleteBackward` the
        //   // correct number of times.
        //   //
        //   // WARNING:
        //   // You may be tempted to merge this code with the code below but
        //   // it will not work. This may be a bug in Slate's implementation.
        //   // Before removing this if/else, make sure it works for continuous
        //   // backspace starting from an expanded and collapsed range.
        //   editor.deleteBackward(backspaceCount)
        // } else {
        //   console.log(2)
        //   // If the `lastSelection` is not collapsed (i.e. it is expanded)
        //   // then we `deleteBackward(1)` in order to delete the range.
        //   // We then `deleteBackward` the remaining count if there are any.
        //   // Slate will not allow us to call `deleteBackward` with the full
        //   // count. It will always only delete the current selection.
        //   //
        //   // WARNING:
        //   // You may be tempted to merge with above. At time of this comment,
        //   // it won't work.
        //   editor.deleteBackward(1)
        //   if (backspaceCount > 1) {
        //     editor.deleteBackward(backspaceCount - 1)
        //   }
        // }
        return true
      },
    },
    /**
     * Handle `backspace-once-from-end-of-word`
     *
     * Deleting once that removes a DOM node.
     *
     * - beforeinput:insertCompositionText "wor"
     * - input:insertCompositionText "wor"
     */
    {
      name: 'backspace-that-removes-element',
      onFinish(events, { editor }) {
        const insertCompositionTextEvent = events.find(
          event =>
            event.type === 'input' &&
            event.nativeEvent.inputType === 'insertCompositionText'
        )
        if (!insertCompositionTextEvent) return
        const anchorExists = document.body.contains(snapshot.anchorNode)
        console.log('anchorNode', snapshot.anchorNode, anchorExists)
        if (anchorExists) return
        const selection = snapshot.apply(editor)
        reconciler.apply(window, editor, {
          from: 'backspace-that-removes-element',
        })
        editor.select(selection)
        editor.deleteBackward(1)
        return true
      },
    },
    // /**
    //  * Handle `continuous-backspace-from-middle-of-word`
    //  *
    //  * - compositionend
    //  * - keydown "Unidentified"
    //  * - beforeinput:deleteContentBackward
    //  * - input:deleteContentBackward
    //  */
    // {
    //   name: 'continuous-backspace-from-middle-of-word',
    //   onFinish(events, { editor }) {
    //     // Find the number of matching delete events
    //     const deleteEvents = events.filter(event => {
    //       return (
    //         event.type === 'input' &&
    //         event.nativeEvent.inputType === 'deleteContentBackward'
    //       )
    //     })
    //     // If we can't find any deletes then return
    //     if (deleteEvents.length === 0) return
    //     // revert to before the deletes started
    //     snapshot.apply(editor)
    //     // console.log('lastSelection', lastSelection.toJS())
    //     editor.select(lastSelection)
    //     // delete the same number of times that Android told us it did
    //     editor.deleteBackward(deleteEvents.length)
    //     return true
    //   },
    // },
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
        // Required when deleting a word and after you delete the last letter
        // in the word one by one.
        reconciler.addNode()
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
   * When you press the `backspace` key, the dom collapses before we are able
   * to get the `domSelection`. For this reason, we need to keep the previous
   * `domSelection` around for the case of handling a backspace on a Range.
   *
   * If we don't, we end up deleting one character instead of the entire
   * selection.
   */

  let lastSelection = null

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
    actionManager.refresh(event, editor)

    // actionManager.trigger(event, editor)
    // selectManager.trigger(event, editor, next)

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
