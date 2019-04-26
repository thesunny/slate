import Debug from 'debug'
import getWindow from 'get-window'
import pick from 'lodash/pick'

import { ANDROID_API_VERSION } from 'slate-dev-environment'
import fixSelectionInZeroWidthBlock from '../utils/fix-selection-in-zero-width-block'
import getSelectionFromDom from '../utils/get-selection-from-dom'
import setSelectionFromDom from '../utils/set-selection-from-dom'
import setTextFromDomNode from '../utils/set-text-from-dom-node'
import isInputDataEnter from '../utils/is-input-data-enter'
import isInputDataLastChar from '../utils/is-input-data-last-char'
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

function Android9Plugin() {
  debug('initializing Android9Plugin')

  const actionManager = new ActionManager({}, [
    {
      name: 'log',
      onSetup() {
        console.log('<===== SETUP')
      },
      onTeardown() {
        console.log('TEARDOWN =====>')
      },
      onTrigger(event) {
        console.log('TRIGGER', event.type)
      },
      onFinish() {
        console.log('FINISH')
      },
    },
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
   * Keep a snapshot after a composition end for API 26/27. If a `beforeInput`
   * gets called with data that ends in an ENTER then we need to use this
   * snapshot to revert the DOM so that React doesn't get out of sync with the
   * DOM. We also need to cancel the `reconcile` operation as it interferes in
   * certain scenarios like hitting 'enter' at the end of a word.
   *
   * @type {DomSnapshot} [compositionEndSnapshot]
   
   */

  let compositionEndSnapshot = null

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

  let keyDownSnapshot = null

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

  function reconcile(window, editor, { from }) {
    debug.reconcile({ from })
    const domSelection = window.getSelection()

    nodes.forEach(node => {
      setTextFromDomNode(window, editor, node)
    })

    setSelectionFromDom(window, editor, domSelection)
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

    const window = getWindow(event.target)
    const domSelection = window.getSelection()
    const { anchorNode } = domSelection

    compositionEndAction = 'reconcile'
    nodes.add(anchorNode)

    reconciler = new DelayedExecutor(window, () => {
      status = NONE
      reconcile(window, editor, { from: 'onCompositionEnd:reconciler' })
      compositionEndAction = null
    })
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

    // Setup the updater by clearing it and adding the current cursor position
    // as the first node to look at.
    updater.clear()
    const { anchorNode } = window.getSelection()
    updater.addNode(anchorNode)

    actionManager.trigger(event, editor)
    status = COMPOSING
    nodes.clear()
  }

  /**
   * On composition update.
   *
   * @param  {Event} event
   * @param  {Editor} editor
   * @param  {Function} next
   */

  function onCompositionUpdate(event, editor, next) {
    // Add current node to the updater
    const { anchorNode } = window.getSelection()
    updater.addNode(anchorNode)

    actionManager.trigger(event, editor)
    debug('onCompositionUpdate', { event })
  }

  /**
   * On input.
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

    const { nativeEvent } = event

    // NOTE API 28:
    // When a user hits space and then backspace in `middle` we end up
    // with `midle`.
    //
    // This is because when the user hits space, the composition is not
    // ended because `compositionEnd` is not called yet. When backspace is
    // hit, the `compositionEnd` is called. We need to revert the DOM but
    // the reconciler has not had a chance to run from the
    // `compositionEnd` because it is set to run on the next
    // `requestAnimationFrame`. When the backspace is carried out on the
    // Slate Value, Slate doesn't know about the space yet so the
    // backspace is carried out without the space cuasing us to lose a
    // character.
    //
    // This fix forces Android to reconcile immediately after hitting
    // the space.
    if (nativeEvent.inputType === 'insertText' && nativeEvent.data === ' ') {
      if (reconciler) reconciler.cancel()
      if (deleter) deleter.cancel()
      reconcile(window, editor, { from: 'onInput:space' })
      return
    }

    if (nativeEvent.inputType === 'deleteContentBackward') {
      debug('onInput:delete', { keyDownSnapshot })
      const window = getWindow(event.target)
      if (reconciler) reconciler.cancel()
      if (deleter) deleter.cancel()

      deleter = new DelayedExecutor(
        window,
        () => {
          debug('onInput:delete:callback', { keyDownSnapshot })
          keyDownSnapshot.apply(editor)
          editor.deleteBackward()
          deleter = null
        },
        {
          onCancel() {
            deleter = null
          },
        }
      )
      return
    }

    if (status === COMPOSING) {
      const { anchorNode } = window.getSelection()
      nodes.add(anchorNode)
      return
    }

    // Some keys like '.' are input without compositions. This happens
    // in API28. It might be happening in API 27 as well. Check by typing
    // `It me. No.` On a blank line.
    debug('onInput:fallback')
    const { anchorNode } = window.getSelection()
    nodes.add(anchorNode)

    window.requestAnimationFrame(() => {
      debug('onInput:fallback:callback')
      reconcile(window, editor, { from: 'onInput:fallback' })
    })
    return
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

    // We need to take a snapshot of the current selection and the
    // element before when the user hits the backspace key. This is because
    // we only know if the user hit backspace if the `onInput` event that
    // follows has an `inputType` of `deleteContentBackward`. At that time
    // it's too late to stop the event.
    keyDownSnapshot = new DomSnapshot(window, editor, {
      before: true,
    })

    debug('onKeyDown:snapshot', { keyDownSnapshot })
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
