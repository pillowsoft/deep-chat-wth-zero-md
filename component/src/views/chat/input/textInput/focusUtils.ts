import { Browser } from '../../../../utils/browser/browser';
import { TextInputEl } from './textInput';

export class FocusUtils {
  public static focusEndOfInput(inputElement: HTMLElement) {
    // First ensure the element has focus
    inputElement.focus();

    // Try the Selection and Range API first
    try {
      const range = document.createRange();
      range.selectNodeContents(inputElement);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {
      console.warn('Primary focus method failed, trying alternative', e);

      // Fallback for Safari
      if (document.createNodeIterator) {
        // Find the last text node
        const nodeIterator = document.createNodeIterator(
          inputElement,
          NodeFilter.SHOW_TEXT,
          null
        );
        let lastTextNode: Node | null = null;
        let currentNode: Node | null;

        while ((currentNode = nodeIterator.nextNode())) {
          lastTextNode = currentNode;
        }

        if (lastTextNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(lastTextNode, lastTextNode.textContent?.length || 0);
            range.setEnd(lastTextNode, lastTextNode.textContent?.length || 0);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else {
          // If no text nodes exist, create one
          const textNode = document.createTextNode('\u200B'); // Zero-width space
          inputElement.appendChild(textNode);
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(textNode, 1);
            range.setEnd(textNode, 1);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }
  }

  public static focusFromParentElement(parentElement: HTMLElement) {
    console.log('focusFromParentElement');
    const inputElement = parentElement.querySelector(`#${TextInputEl.TEXT_INPUT_ID}`) as HTMLElement;
    if (inputElement) {
      console.log('focus input element!');
      if (Browser.IS_SAFARI) inputElement.focus(); // can only focus the start of the input in Safari
      FocusUtils.focusEndOfInput(inputElement);
    }
  }
}
