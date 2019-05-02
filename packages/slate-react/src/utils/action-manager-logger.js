/**
 * Helper to log a trigger to the console.
 *
 * @param {string} type
 * @param {string} subtype
 * @param {any} data
 */

function logTrigger(type, subtype, data) {
  const fullType = subtype ? `${type}:${subtype}` : type
  console.log('TRIGGER', fullType, JSON.stringify(data))
}

export function logEvent(event) {
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
}

/**
 * An ActionManager handler for logging
 */
const actionManagerLogger = {
  name: 'log',
  onSetup() {
    console.log('<===== SETUP ==')
  },
  onTeardown() {
    console.log('====== TEARDOWN ==>')
  },
  onTrigger(event) {
    // logEvent(event)
  },
  onFinish() {
    console.log('FINISH')
  },
}

export default actionManagerLogger
