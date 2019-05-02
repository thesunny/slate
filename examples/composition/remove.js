import { p, text, bold } from './util'

export default {
  text: `Follow instructions. Only hold key when it says "hold"`,
  document: {
    nodes: [
      p(bold('Cursor to "mid|dle". Hold backspace into "start":')),
      p(text('Delete into start from middle')),
      p(bold('Cursor to "end|". Hold backspace into "start"')),
      p(text('Delete into start from end')),
      p(bold('Cursor to "h|ere". Backspace 4 times slowly')),
      p(text('Backspace into '), bold('bold'), text(' here')),
      p(bold('Cursor to "h|ere". Backspace 4 times fast! (BROKEN)')),
      p(text('Fast backspace here')),
      p(bold('Select entire "range". Press backspace.')),
      p(text('Delete from range')),
      p(bold('Select entire "range". Hold backspace into "start"')),
      p(text('Delete to start from range')),
      p(bold('Cursor to "end|". Backspace 4 times')),
      p(text('Backspace from end')),
    ],
  },
}
