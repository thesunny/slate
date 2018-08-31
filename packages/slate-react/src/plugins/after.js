import Base64 from 'slate-base64-serializer'
import Debug from 'debug'
import Plain from 'slate-plain-serializer'
import { IS_IOS, IS_ANDROID } from 'slate-dev-environment'
import React from 'react'
import getWindow from 'get-window'
import { Block, Inline, Text } from 'slate'
import Hotkeys from 'slate-hotkeys'

import EVENT_HANDLERS from '../constants/event-handlers'
import Content from '../components/content'
import cloneFragment from '../utils/clone-fragment'
import findDOMNode from '../utils/find-dom-node'
import findNode from '../utils/find-node'
import findPoint from '../utils/find-point'
import findRange from '../utils/find-range'
import getEventRange from '../utils/get-event-range'
import getEventTransfer from '../utils/get-event-transfer'
import setEventTransfer from '../utils/set-event-transfer'

import { HAS_COMPOSITION } from './composition'

import getDiffOffsets from './getDiffOffsets'
import shouldChangeText from './shouldChangeText'
import setSelectionFromDOM from './set-selection-from-dom'
import setTextFromDomSelection from './set-text-from-dom-selection'

/**
 * Debug.
 *
 * @type {Function}
 */

const debug = Debug('slate:after')

/**
 * The after plugin.
 *
 * @return {Object}
 */

function AfterPlugin() {
  let isDraggingInternally = null

  /**
   * On before input.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  // `beforeinput` created based on two other events `textInput` and `keypress`
  //
  // https://github.com/facebook/react/issues/11211
  function onBeforeInput(event, change, editor) {
    // console.warn('onBeforeInput')
    debug('onBeforeInput', { event })

    if (IS_ANDROID) return // don't return true or we won't see onInput

    // if (HAS_COMPOSITION) {
    //   debug('onBeforeInput CANCEL')
    //   return
    // }

    const isSynthetic = !!event.nativeEvent

    // If the event is synthetic, it's React's polyfill of `beforeinput` that
    // isn't a true `beforeinput` event with meaningful information. It only
    // gets triggered for character insertions, so we can just insert directly.
    if (isSynthetic) {
      event.preventDefault()
      change.insertText(event.data)
      return
    }

    // Otherwise, we can use the information in the `beforeinput` event to
    // figure out the exact change that will occur, and prevent it.
    const [targetRange] = event.getTargetRanges()
    if (!targetRange) return

    event.preventDefault()

    const { value } = change
    const { selection } = value
    const range = findRange(targetRange, value)

    switch (event.inputType) {
      case 'deleteByDrag':
      case 'deleteByCut':
      case 'deleteContent':
      case 'deleteContentBackward':
      case 'deleteContentForward': {
        change.deleteAtRange(range)
        return
      }

      case 'deleteWordBackward': {
        change.deleteWordBackwardAtRange(range)
        return
      }

      case 'deleteWordForward': {
        change.deleteWordForwardAtRange(range)
        return
      }

      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward': {
        change.deleteLineBackwardAtRange(range)
        return
      }

      case 'deleteSoftLineForward':
      case 'deleteHardLineForward': {
        change.deleteLineForwardAtRange(range)
        return
      }

      case 'insertLineBreak':
      case 'insertParagraph': {
        if (change.value.isInVoid) {
          change.moveToStartOfNextText()
        } else {
          change.splitBlockAtRange(range)
        }

        return
      }

      case 'insertFromYank':
      case 'insertReplacementText':
      case 'insertText': {
        if (IS_ANDROID) return
        // COMPAT: `data` should have the text for the `insertText` input type
        // and `dataTransfer` should have the text for the
        // `insertReplacementText` input type, but Safari uses `insertText` for
        // spell check replacements and sets `data` to `null`. (2018/08/09)
        const text =
          event.data == null
            ? event.dataTransfer.getData('text/plain')
            : event.data

        if (text == null) return

        change.insertTextAtRange(range, text, selection.marks)

        // If the text was successfully inserted, and the selection had marks
        // on it, unset the selection's marks.
        if (selection.marks && value.document != change.value.document) {
          change.select({ marks: null })
        }

        return
      }
    }
  }

  /**
   * On blur.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onBlur(event, change, editor) {
    debug('onBlur', { event })

    change.blur()
  }

  /**
   * On click.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onClick(event, change, editor) {
    if (editor.props.readOnly) return true
    return true

    const { value } = change
    const { document } = value
    const node = findNode(event.target, value)
    const isVoid = node && (node.isVoid || document.hasVoidParent(node.key))

    if (isVoid) {
      // COMPAT: In Chrome & Safari, selections that are at the zero offset of
      // an inline node will be automatically replaced to be at the last offset
      // of a previous inline node, which screws us up, so we always want to set
      // it to the end of the node. (2016/11/29)
      change.focus().moveToEndOfNode(node)
    }

    debug('onClick', { event })
  }

  /**
   * On copy.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onCopy(event, change, editor) {
    debug('onCopy', { event })

    cloneFragment(event, change.value)
  }

  /**
   * On cut.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onCut(event, change, editor) {
    debug('onCut', { event })

    // Once the fake cut content has successfully been added to the clipboard,
    // delete the content in the current selection.
    cloneFragment(event, change.value, change.value.fragment, () => {
      // If user cuts a void block node or a void inline node,
      // manually removes it since selection is collapsed in this case.
      const { value } = change
      const { endBlock, endInline, selection } = value
      const { isCollapsed } = selection
      const isVoidBlock = endBlock && endBlock.isVoid && isCollapsed
      const isVoidInline = endInline && endInline.isVoid && isCollapsed

      if (isVoidBlock) {
        editor.change(c => c.removeNodeByKey(endBlock.key))
      } else if (isVoidInline) {
        editor.change(c => c.removeNodeByKey(endInline.key))
      } else {
        editor.change(c => c.delete())
      }
    })
  }

  /**
   * On drag end.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onDragEnd(event, change, editor) {
    debug('onDragEnd', { event })

    isDraggingInternally = null
  }

  /**
   * On drag over.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onDragOver(event, change, editor) {
    debug('onDragOver', { event })
  }

  /**
   * On drag start.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onDragStart(event, change, editor) {
    debug('onDragStart', { event })

    isDraggingInternally = true

    const { value } = change
    const { document } = value
    const node = findNode(event.target, value)
    const isVoid = node && (node.isVoid || document.hasVoidParent(node.key))

    if (isVoid) {
      const encoded = Base64.serializeNode(node, { preserveKeys: true })
      setEventTransfer(event, 'node', encoded)
    } else {
      const { fragment } = value
      const encoded = Base64.serializeNode(fragment)
      setEventTransfer(event, 'fragment', encoded)
    }
  }

  /**
   * On drop.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onDrop(event, change, editor) {
    debug('onDrop', { event })

    const window = getWindow(event.target)

    const { value } = change
    const { document, selection } = value

    let target = getEventRange(event, value)
    if (!target) return

    const transfer = getEventTransfer(event)
    const { type, fragment, node, text } = transfer

    change.focus()

    // If the drag is internal and the target is after the selection, it
    // needs to account for the selection's content being deleted.
    if (
      isDraggingInternally &&
      selection.end.key == target.end.key &&
      selection.end.offset < target.end.offset
    ) {
      target = target.move(
        selection.start.key == selection.end.key
          ? 0 - selection.end.offset + selection.start.offset
          : 0 - selection.end.offset
      )
    }

    if (isDraggingInternally) {
      change.delete()
    }

    change.select(target)

    if (type == 'text' || type == 'html') {
      const { anchor } = target
      let hasVoidParent = document.hasVoidParent(anchor.key)

      if (hasVoidParent) {
        let n = document.getNode(anchor.key)

        while (hasVoidParent) {
          n = document.getNextText(n.key)
          if (!n) break
          hasVoidParent = document.hasVoidParent(n.key)
        }

        if (n) change.moveToStartOfNode(n)
      }

      if (text) {
        text.split('\n').forEach((line, i) => {
          if (i > 0) change.splitBlock()
          change.insertText(line)
        })
      }
    }

    if (type == 'fragment') {
      change.insertFragment(fragment)
    }

    if (type == 'node' && Block.isBlock(node)) {
      change.insertBlock(node.regenerateKey()).removeNodeByKey(node.key)
    }

    if (type == 'node' && Inline.isInline(node)) {
      change.insertInline(node.regenerateKey()).removeNodeByKey(node.key)
    }

    // COMPAT: React's onSelect event breaks after an onDrop event
    // has fired in a node: https://github.com/facebook/react/issues/11379.
    // Until this is fixed in React, we dispatch a mouseup event on that
    // DOM node, since that will make it go back to normal.
    const focusNode = document.getNode(target.focus.key)
    const el = findDOMNode(focusNode, window)
    if (!el) return

    el.dispatchEvent(
      new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
      })
    )
  }

  /**
   * On input.
   *
   * @param {Event} eventvent
   * @param {Change} change
   */

  function onInput(event, change, editor) {
    debug('onInput')

    const window = getWindow(event.target)

    if (shouldChangeText.onInput(window, change, editor, onTextChange)) {
      return onTextChange(window, change, editor, 'onInput')
    }
  }

  function getOffsetInNode(sel, node) {
    console.log('getOffsetInNode', sel, node)
    // const doc = node.ownerDocument || node.document
    // const range = sel.createRange()
    // const startOfNodeRange = doc.body.createTextRange()
    // startOfNodeRange.moveToElementText(node)
    // startOfNodeRange.setEndPoint('EndToEnd', textRange)
    // const caretOffset = startOfNodeRange.text.length
    // return caretOffset

    const range = sel.getRangeAt(0)
    const nodeRange = range.cloneRange()
    nodeRange.selectNodeContents(node)
    nodeRange.setEnd(range.endContainer, range.endOffset)
    return nodeRange.toString().length

    // var caretOffset = 0
    // var doc = element.ownerDocument || element.document
    // var win = doc.defaultView || doc.parentWindow
    // var sel
    // if (typeof win.getSelection != 'undefined') {
    //   sel = win.getSelection()
    //   if (sel.rangeCount > 0) {
    //     var range = win.getSelection().getRangeAt(0)
    //     var preCaretRange = range.cloneRange()
    //     preCaretRange.selectNodeContents(element)
    //     preCaretRange.setEnd(range.endContainer, range.endOffset)
    //     caretOffset = preCaretRange.toString().length
    //   }
    // } else if ((sel = doc.selection) && sel.type != 'Control') {
    //   var textRange = sel.createRange()
    //   var preCaretTextRange = doc.body.createTextRange()
    //   preCaretTextRange.moveToElementText(element)
    //   preCaretTextRange.setEndPoint('EndToEnd', textRange)
    //   caretOffset = preCaretTextRange.text.length
    // }
    // return caretOffset
  }

  function getOffsetOfNode(domSelection) {
    const node = domSelection.anchorNode
    const closest = node.parentNode.closest('[data-key]')
    const range = domSelection.getRangeAt(0)
    const nodeRange = range.cloneRange()
    // select the entire `closest` range which is the block
    nodeRange.selectNodeContents(closest)
    // move the end of range to the beginning of the node with the selection
    nodeRange.setEnd(range.endContainer, 0)
    return nodeRange.toString().length
  }

  function onTextChange(window, change, editor, src) {
    return setTextFromDomSelection(window, change, editor, src)
  }

  function onCompositionUpdate(event, change, editor) {

    const window = getWindow(event.target)

    if (
      shouldChangeText.onCompositionUpdate(
        window,
        change,
        editor,
        onTextChange
      )
    ) {
      return onTextChange(window, change, editor, 'onCompositionUpdate')
    }
    return true
  }

  function onCompositionEnd(event, change, editor) {
    debug('onCompositionEnd', { event })

    const window = getWindow(event.target)
    
    if (
      shouldChangeText.onCompositionEnd(
        window,
        change,
        editor,
        onTextChange
      )
    ) {
      return onTextChange(event.target, change, editor, 'onCompositionEnd')
    }
    return true
  }


  /**
   * On key down.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  // TODO:
  // Try reconciling the DOM and then calling the split block stuff.
  // Also, make sure to call `setSelectionChange` so the cursor is in the right
  // place.
  //
  // TODO:
  // Also, take a look at onTextChange. There is an editor.change method in
  // there that I think should be removed and replaced simply with the `change`
  // object which was passed in. These may be conflicting with each other.

  function onKeyDown(event, change, editor) {
    console.warn('onKeyDown', {
      isComposing: editor.state.isComposing,
      isStrictComposing: editor.isStrictComposing,
    })
    debug('onKeyDown', { event })

    const window = getWindow(event.target)

    if (
      shouldChangeText.onKeyDown(window, change, editor, onTextChange)
    ) {
      onTextChange(window, change, editor, 'onKeyDown')
    }

    const { value } = change

    // COMPAT: In iOS, some of these hotkeys are handled in the
    // `onNativeBeforeInput` handler of the `<Content>` component in order to
    // preserve native autocorrect behavior, so they shouldn't be handled here.
    if (Hotkeys.isSplitBlock(event) && !IS_IOS) {
      return value.isInVoid
        ? change.moveToStartOfNextText()
        : change.splitBlock()
    }

    if (Hotkeys.isDeleteBackward(event) && !IS_IOS) {
      return change.deleteCharBackward()
    }

    if (Hotkeys.isDeleteForward(event) && !IS_IOS) {
      return change.deleteCharForward()
    }

    if (Hotkeys.isDeleteLineBackward(event)) {
      return change.deleteLineBackward()
    }

    if (Hotkeys.isDeleteLineForward(event)) {
      return change.deleteLineForward()
    }

    if (Hotkeys.isDeleteWordBackward(event)) {
      return change.deleteWordBackward()
    }

    if (Hotkeys.isDeleteWordForward(event)) {
      return change.deleteWordForward()
    }

    if (Hotkeys.isRedo(event)) {
      return change.redo()
    }

    if (Hotkeys.isUndo(event)) {
      return change.undo()
    }

    // COMPAT: Certain browsers don't handle the selection updates properly. In
    // Chrome, the selection isn't properly extended. And in Firefox, the
    // selection isn't properly collapsed. (2017/10/17)
    if (Hotkeys.isMoveLineBackward(event)) {
      event.preventDefault()
      return change.moveToStartOfBlock()
    }

    if (Hotkeys.isMoveLineForward(event)) {
      event.preventDefault()
      return change.moveToEndOfBlock()
    }

    if (Hotkeys.isExtendLineBackward(event)) {
      event.preventDefault()
      return change.moveFocusToStartOfBlock()
    }

    if (Hotkeys.isExtendLineForward(event)) {
      event.preventDefault()
      return change.moveFocusToEndOfBlock()
    }

    // COMPAT: If a void node is selected, or a zero-width text node adjacent to
    // an inline is selected, we need to handle these hotkeys manually because
    // browsers won't know what to do.
    if (Hotkeys.isMoveBackward(event)) {
      const { document, isInVoid, previousText, startText } = value
      const isPreviousInVoid =
        previousText && document.hasVoidParent(previousText.key)

      if (isInVoid || isPreviousInVoid || startText.text == '') {
        event.preventDefault()
        return change.moveBackward()
      }
    }

    if (Hotkeys.isMoveForward(event)) {
      const { document, isInVoid, nextText, startText } = value
      const isNextInVoid = nextText && document.hasVoidParent(nextText.key)

      if (isInVoid || isNextInVoid || startText.text == '') {
        event.preventDefault()
        return change.moveForward()
      }
    }

    if (Hotkeys.isExtendBackward(event)) {
      const { document, isInVoid, previousText, startText } = value
      const isPreviousInVoid =
        previousText && document.hasVoidParent(previousText.key)

      if (isInVoid || isPreviousInVoid || startText.text == '') {
        event.preventDefault()
        return change.moveFocusBackward()
      }
    }

    if (Hotkeys.isExtendForward(event)) {
      const { document, isInVoid, nextText, startText } = value
      const isNextInVoid = nextText && document.hasVoidParent(nextText.key)

      if (isInVoid || isNextInVoid || startText.text == '') {
        event.preventDefault()
        return change.moveFocusForward()
      }
    }

  }

  /**
   * On paste.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onPaste(event, change, editor) {
    debug('onPaste', { event })

    const transfer = getEventTransfer(event)
    const { type, fragment, text } = transfer

    if (type == 'fragment') {
      change.insertFragment(fragment)
    }

    if (type == 'text' || type == 'html') {
      if (!text) return
      const { value } = change
      const { document, selection, startBlock } = value
      if (startBlock.isVoid) return

      const defaultBlock = startBlock
      const defaultMarks = document.getInsertMarksAtRange(selection)
      const frag = Plain.deserialize(text, { defaultBlock, defaultMarks })
        .document
      change.insertFragment(frag)
    }
  }

  /**
   * On select.
   *
   * @param {Event} event
   * @param {Change} change
   * @param {Editor} editor
   */

  function onSelect(event, change, editor) {
    debug('onSelect', { event })

    const window = getWindow(event.target)

    return setSelectionFromDOM(window, change, editor, {
      from: 'onSelect',
    })
  }

  /**
   * Render editor.
   *
   * @param {Object} props
   * @param {Editor} editor
   * @return {Object}
   */

  function renderEditor(props, editor) {
    const handlers = EVENT_HANDLERS.reduce((obj, handler) => {
      obj[handler] = editor[handler]
      return obj
    }, {})

    return (
      <Content
        {...handlers}
        autoCorrect={props.autoCorrect}
        className={props.className}
        children={props.children}
        editor={editor}
        readOnly={props.readOnly}
        role={props.role}
        spellCheck={props.spellCheck}
        style={props.style}
        tabIndex={props.tabIndex}
        tagName={props.tagName}
      />
    )
  }

  /**
   * Render node.
   *
   * @param {Object} props
   * @return {Element}
   */

  function renderNode(props) {
    const { attributes, children, node } = props
    if (node.object != 'block' && node.object != 'inline') return
    const Tag = node.object == 'block' ? 'div' : 'span'
    const style = { position: 'relative' }
    return (
      <Tag {...attributes} style={style}>
        {children}
      </Tag>
    )
  }

  /**
   * Render placeholder.
   *
   * @param {Object} props
   * @return {Element}
   */

  function renderPlaceholder(props) {
    const { editor, node } = props
    if (!editor.props.placeholder) return
    if (editor.state.isComposing) return
    if (node.object != 'block') return
    if (!Text.isTextList(node.nodes)) return
    if (node.text != '') return
    if (editor.value.document.getBlocks().size > 1) return

    const style = {
      pointerEvents: 'none',
      display: 'inline-block',
      width: '0',
      maxWidth: '100%',
      whiteSpace: 'nowrap',
      opacity: '0.333',
    }

    return (
      <span contentEditable={false} style={style}>
        {editor.props.placeholder}
      </span>
    )
  }

  /**
   * Return the plugin.
   *
   * @type {Object}
   */

  return {
    onBeforeInput,
    onBlur,
    onClick,
    onCopy,
    onCut,
    onDragEnd,
    onDragOver,
    onDragStart,
    onDrop,
    onInput,
    onCompositionUpdate,
    onCompositionEnd,
    onKeyDown,
    onPaste,
    onSelect,
    renderEditor,
    renderNode,
    renderPlaceholder,
  }
}

/**
 * Export.
 *
 * @type {Object}
 */

export default AfterPlugin
