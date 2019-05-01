import { p, text, bold } from './util'

export default {
  text: `Enter text below each line of instruction exactly including mis-spelling wasnt`,
  document: {
    nodes: [
      p(bold('Cursor to "mid|dle". Hold backspace into "start":')),
      p(text('Delete into start from middle')),
      p(bold('Cursor to "end|". Hold backspace into "start"')),
      p(text('Delete into start from end')),
      p(bold('Cursor to "h|ere". Backspace 4 times')),
      p(text('Backspace into '), bold('bold'), text(' here')),
    ],
  },
}
