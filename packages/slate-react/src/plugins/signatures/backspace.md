# Backspace Signatures

## Hit backspace 3 times

compositionstart
keydown "Unidentified"
beforeinput:insertCompositionText "middl"
input:insertCompositionText "middl"
keyup
keyup
selectionchange
selectionchange
keydown "Unidentified"
beforeinput:insertCompositionText "midd"
input:insertCompositionText "midd"
keyup
keyup
selectionchange
selectionchange
keydown "Unidentified"
beforeinput:insertCompositionText "mid"
input:insertCompositionText "mid"
keyup
keyup
selectionchange
selectionchange

## Hold backspace over 3 characters

compositionstart
keydown "Unidentified"
beforeinput:insertCompositionText "middl"
input:insertCompositionText "middl"
keyup
keyup
selectionchange
keydown "Unidentified"
beforeinput:insertCompositionText "midd"
input:insertCompositionText "midd"
keyup
keyup
keydown "Unidentified"
beforeinput:insertCompositionText "mid"
input:insertCompositionText "mid"
keyup
keyup
selectionchange
selectionchange

## Hold backspace through a word

* 3.084 - mouseup
* 3.099 - click
* 3.109 - selectionchange
  // start of composition
* 3.145 - compositionstart
* 4.725 - keydown "Unidentified" repeat:false
* 4.73 - beforeinput:insertCompositionText "en"
* 4.737 - input:insertCompositionText "en"
* 4.742 - keyup
* 4.745 - keyup
* 4.75 - selectionchange
* 4.786 - keydown "Unidentified" repeat:false
* 4.803 - beforeinput:insertCompositionText "e"
* 4.808 - input:insertCompositionText "e"
* 4.817 - keyup
* 4.823 - keyup
* 4.844 - keydown "Unidentified" repeat:false
* 4.859 - beforeinput:insertCompositionText ""
* 4.87 - input:insertCompositionText null
* 4.876 - compositionend
* 4.884 - keyup
* 4.888 - keyup
* 4.899 - selectionchange
  // I think this marks deletion to end of word
* 4.903 - keydown "Unidentified" repeat:false
* 4.905 - beforeinput:deleteContentBackward null
* 4.909 - input:deleteContentBackward null
* 4.914 - keyup
* 4.925 - keyup
* 4.932 - compositionstart
  // I think this marks deletion to space
* 5.015 - keydown "Unidentified" repeat:false
* 5.03 - compositionstart
* 5.033 - beforeinput:insertCompositionText "fro"
* 5.037 - input:insertCompositionText "fro"
* 5.064 - keyup
* 5.074 - selectionchange
* 5.081 - keydown "Unidentified" repeat:false
* 5.086 - beforeinput:insertCompositionText "fr"
* 5.093 - input:insertCompositionText "fr"
* 5.097 - keyup
* 5.102 - keyup
* 5.176 - selectionchange

// DELETE!

* 1 - compositionend
* 27 - keydown "Unidentified"
* 40 - beforeinput:deleteContentBackward null
* 67 - input:deleteContentBackward null
* 89 - keyup
* 95 - keyup
* 113 - selectionchange
* 213 - selectionchange

> This is hitting `backspace` to delete the first letter of a word which exits
> the composition

* 1 - compositionend
* 85 - keydown "Unidentified"
* 99 - beforeinput:deleteContentBackward null
* 111 - input:deleteContentBackward null
* 120 - keyup
* 139 - selectionchange
* 238 - selectionchange

> This is hitting `backspace` to delete a letter inside of a composition

* 1 - compositionend
* 79 - keydown "Unidentified"
* 93 - beforeinput:deleteContentBackward null
* 106 - input:deleteContentBackward null
* 113 - keyup
* 129 - selectionchange
* 231 - selectionchange
