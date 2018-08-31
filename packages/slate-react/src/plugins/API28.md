# API28

## TODO

- [ ] Android blows away React nodes when the composition changes the entire node like in `<b>bold</b>`
- [ ] When user changes selection in middle of `composition` we can't update the DOM or the selection resets to where the `composition` happened. Try a workaround of waiting for the cursor to move and rendering the DOM document changes (without DOM selection change) where the cursor currently isn't. Might work.
- [ ] Clicking last position in document during a composition returns cursor to start of composition. This happens during the `onSelect` event.


## Gotchas

- I think? Render during a composition resets the selection if there is a DOM change.
- Selection is ok from the `onKeyDown` event that fires before the `compositionStart` even though there is a render.
- Watch your `value.document` changes.


## Things to try

- [ ] resolve the document against the DOM node after the cursor position moves out of the DOM node


## Important Info

- Don't resolve during `onCompositionEnd`. It's too early as the edit hasn't made it to the DOM yet.
- Do resolve on the `onInput` immediately after `onCompositionEnd`. This works for all input types.
- resolving from DOM state fails when the user moves their cursor in the middle of a composition because API28 will not recognize that as the end of a composition. Instead, it will treat the edit which now spans multiple blocks as a single composition.
