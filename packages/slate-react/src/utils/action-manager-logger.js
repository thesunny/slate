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
  onFinish() {
    console.log('FINISH')
  },
}

export default actionManagerLogger
