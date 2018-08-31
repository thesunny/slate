String.prototype.splice = function(start, delCount, newSubStr) {
  return this.slice(0, start) + newSubStr + this.slice(start + Math.abs(delCount));
};

export default function getContent(el, range, content = []) {
  if (el.nodeType === Node.TEXT_NODE) {
    let textContent = el.textContent;
    if (range.startContainer === el) {
      textContent = textContent.splice(range.startOffset, 0, '|');
    }
    content.push(textContent);
  } else {
    for (let i = 0; i < el.childNodes.length; i++) {
      const childNode = el.childNodes[i];
      getContent(childNode, range, content);
    }
  }
  return content;
}
