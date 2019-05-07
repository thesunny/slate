import Debug from 'debug'

/**
 * The `debug` object. It is named differently than Slate's standard
 * `slate:namespace` debug objects. This is to make it stand out because when
 * debug events is enabled, we are trying to see how these events are positioned
 * within Slate's other `debug` logging.
 */

const debug = Debug('EVENT')

// We force `debug.enabled = true` here because the Logger is only used when we
// definitely want the output to be logged. The Logger is part of a Debug
// plugin that will not be added to the middleware if event debugging is not
// desired.
//
// We want to avoid including the `logEvent` unless explicitly asked for
// performance reasons. Forcing `enabled` is both convenient and also
// protects us from inadvertently adding it and having the `debug` disabled.
debug.enabled = true

/**
 * Helper to log an event to the console with the most relevant information
 * presented.
 *
 * @param {string} type
 * @param {string} subtype
 * @param {any} data
 */

export function logEvent(event) {
  const e = event.nativeEvent || event
  switch (event.type) {
    case 'keydown':
      debug(e.type, e.key)
      break
    case 'input':
    case 'beforeinput':
    case 'textInput':
      debug(`${e.type}:${e.inputType}`, JSON.stringify(e.data))
      break
    default:
      debug(e.type)
      break
  }
}

export default logEvent
