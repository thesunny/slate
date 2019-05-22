import DOMObserver from './mutation-observer'

function MutationPlugin({ __editor__ }) {
  let isComposing = false
  let observer

  // `findDOMNode` does not exist until later so we use `setTimeout`
  setTimeout(() => {
    const rootEl = __editor__.findDOMNode([])
    observer = new DOMObserver(rootEl)
    observer.start()
  }, 20)

  // function flush(mutations) {
  //   console.log('MUTATIONS!!!', mutations)
  // }

  function onCompositionStart() {
    isComposing = true
    MutationObserver.start()
  }

  function onCompositionEnd() {
    setTimeout(() => {
      isComposing = false
      const mutations = observer.get()
      flush(mutations)
    }, 20)
  }

  function onCompositionUpdate() {}
  function onBeforeInput() {}
  function onInput() {}
  function onKeyDown() {}
  function onSelect() {}

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

export default MutationPlugin
