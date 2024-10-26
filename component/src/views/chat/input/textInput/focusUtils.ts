import { TextInputEl } from './textInput';

export class FocusUtils {
  private static debug(method: string, message: string, ...args: any[]) {
    console.log(`[FocusUtils.${method}] ${message}`, ...args);
  }

  public static focusEndOfInput(inputElement: HTMLElement) {
    // Debug element structure
    this.debug('focusEndOfInput', 'DOM structure', {
      elementId: inputElement?.id,
      children: Array.from(inputElement.children).map(child => ({
        tagName: child.tagName,
        className: child.className,
        id: child.id,
        contentEditable: child.getAttribute('contenteditable')
      }))
    });

    // First find the inner div, create it if it doesn't exist
    let innerDiv = inputElement.querySelector('.inner-focus-div') as HTMLElement;
    if (!innerDiv) {
      innerDiv = document.createElement('div');
      innerDiv.className = 'inner-focus-div';
      innerDiv.setAttribute('role', 'textbox');
      innerDiv.setAttribute('contenteditable', 'true');
      innerDiv.tabIndex = 0;

      // Move any existing content to the inner div
      while (inputElement.firstChild) {
        innerDiv.appendChild(inputElement.firstChild);
      }
      inputElement.appendChild(innerDiv);
    }

    this.debug('focusEndOfInput', 'Inner div state', {
      exists: !!innerDiv,
      contentEditable: innerDiv?.getAttribute('contenteditable'),
      tabIndex: innerDiv?.tabIndex,
      childNodes: innerDiv?.childNodes.length
    });

    // Execute focus in next tick to ensure DOM is ready
    requestAnimationFrame(() => {
      try {
        // Ensure content exists
        if (!innerDiv.childNodes.length) {
          const textNode = document.createTextNode('\u200B');
          innerDiv.appendChild(textNode);
        }

        // Focus the inner div
        innerDiv.focus();

        // Set cursor position
        const range = document.createRange();
        const lastChild = innerDiv.lastChild || innerDiv;
        range.selectNodeContents(lastChild);
        range.collapse(false);

        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        // Verify focus state
        const focusState = {
          activeElement: document.activeElement === innerDiv,
          activeElementId: document.activeElement?.id,
          activeElementClass: (document.activeElement as HTMLElement)?.className,
          hasSelection: selection ? selection.rangeCount > 0 : false,
          selectionType: selection?.type || 'none'
        };

        this.debug('focusEndOfInput', 'Focus attempt complete', focusState);

        // Extra verification
        if (!focusState.activeElement) {
          this.debug('focusEndOfInput', 'Focus failed, trying alternative method');

          // Try clicking the element
          const clickEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          innerDiv.dispatchEvent(clickEvent);
          innerDiv.focus();

          // Verify again
          this.debug('focusEndOfInput', 'Alternative focus attempt complete', {
            activeElement: document.activeElement === innerDiv
          });
        }

      } catch (error) {
        this.debug('focusEndOfInput', 'Error during focus', { error });

        // Fallback
        try {
          // Basic focus without selection
          innerDiv.focus();
          if (!innerDiv.textContent) {
            innerDiv.textContent = '\u200B';
          }
        } catch (fallbackError) {
          this.debug('focusEndOfInput', 'Fallback focus failed', { fallbackError });
        }
      }
    });
  }

  public static focusFromParentElement(parentElement: HTMLElement) {
    this.debug('focusFromParentElement', 'Starting parent focus process');

    const inputElement = parentElement.querySelector(`#${TextInputEl.TEXT_INPUT_ID}`);
    if (!(inputElement instanceof HTMLElement)) {
      this.debug('focusFromParentElement', 'Input element not found');
      return;
    }

    this.focusEndOfInput(inputElement);
  }

  public static hasFocus(element: HTMLElement): boolean {
    const activeElement = document.activeElement;
    const hasFocus = element === activeElement || element.contains(activeElement);

    this.debug('hasFocus', 'Checking focus state', {
      elementId: element.id,
      activeElementId: activeElement?.id,
      hasFocus
    });

    return hasFocus;
  }

  public static forceFocus(inputElement: HTMLElement) {
    this.debug('forceFocus', 'Starting force focus', {
      elementId: inputElement.id,
      currentActive: document.activeElement?.id
    });

    // Clear any existing focus
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Force a DOM reflow
    void inputElement.offsetHeight;

    // Focus with slight delay
    requestAnimationFrame(() => {
      this.focusEndOfInput(inputElement);
    });
  }
}