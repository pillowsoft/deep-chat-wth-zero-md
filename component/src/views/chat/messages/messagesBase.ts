import { MessageElementsStyles, MessageRoleStyles, MessageStyles, UserContent } from '../../../types/messages';
import { MessageContentI, Overwrite } from '../../../types/messagesInternal';
import { ProcessedTextToSpeechConfig } from './textToSpeech/textToSpeech';
import { ElementUtils } from '../../../utils/element/elementUtils';
import { HTMLDeepChatElements } from './html/htmlDeepChatElements';
import { LoadingStyle } from '../../../utils/loading/loadingStyle';
import { FireEvents } from '../../../utils/events/fireEvents';
import { LoadingHistory } from './history/loadingHistory';
import { HTMLClassUtilities } from '../../../types/html';
import { MessageStyleUtils } from './messageStyleUtils';
import { IntroPanel } from '../introPanel/introPanel';
import { Response } from '../../../types/response';
import { Avatars } from '../../../types/avatars';
import { MessageUtils } from './messageUtils';
import { DeepChat } from '../../../deepChat';
import { Names } from '../../../types/names';
import { MessageElements } from './messages';

export class MessagesBase {
  messageElementRefs: MessageElements[] = [];
  textToSpeech?: ProcessedTextToSpeechConfig;
  submitUserMessage?: (content: UserContent) => void;
  readonly elementRef: HTMLElement;
  readonly messageStyles?: MessageStyles;
  readonly messages: MessageContentI[] = [];
  readonly htmlClassUtilities: HTMLClassUtilities = {};
  textElementsToText: [MessageElements, string][] = [];
  protected _introPanel?: IntroPanel;
  protected readonly _avatars?: Avatars;
  protected readonly _names?: Names;
  private readonly _onMessage?: (message: MessageContentI, isHistory: boolean) => void;

  constructor(deepChat: DeepChat) {
    this.elementRef = MessagesBase.createContainerElement();
    this.messageStyles = deepChat.messageStyles;
    this._avatars = deepChat.avatars;
    this._names = deepChat.names;
    this._onMessage = FireEvents.onMessage.bind(this, deepChat);
    if (deepChat.htmlClassUtilities) this.htmlClassUtilities = deepChat.htmlClassUtilities;

    // Add zero-md script if not already present
    if (!document.querySelector('script[src*="zero-md"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://cdn.jsdelivr.net/npm/zero-md@3?register';
      document.head.appendChild(script);

      script.onload = () => {
        this.refreshTextMessages(); // Refresh messages after zero-md is loaded
      };
    }

    setTimeout(() => {
      this.submitUserMessage = deepChat.submitUserMessage;
    });
  }

  private static createContainerElement() {
    const container = document.createElement('div');
    container.id = 'messages';
    return container;
  }

  public addNewTextMessage(text: string, role: string, overwrite?: Overwrite, isTop = false) {
    if (overwrite?.status) {
      const overwrittenElements = this.overwriteText(role, text, this.messageElementRefs);
      if (overwrittenElements) return overwrittenElements;
      overwrite.status = false;
    }
    const messageElements = isTop
      ? this.createAndPrependNewMessageElement(text, role, isTop)
      : this.createAndAppendNewMessageElement(text, role);
    messageElements.bubbleElement.classList.add('text-message');
    this.applyCustomStyles(messageElements, role, false);
    MessageUtils.fillEmptyMessageElement(messageElements.bubbleElement, text);
    const textElements: [MessageElements, string] = [messageElements, text];
    MessageUtils.updateRefArr(this.textElementsToText, textElements, isTop);
    return messageElements;
  }

  private overwriteText(role: string, text: string, elementRefs: MessageElements[]) {
    const elements = MessageUtils.overwriteMessage(this.messages, elementRefs, text, role, 'text', 'text-message');
    if (elements) {
      this.renderText(elements.bubbleElement, text);
      const elementToText = MessageUtils.getLastTextToElement(this.textElementsToText, elements);
      if (elementToText) elementToText[1] = text;
    }
    return elements;
  }

  protected createAndAppendNewMessageElement(text: string, role: string) {
    const messageElements = this.createNewMessageElement(text, role);
    this.elementRef.appendChild(messageElements.outerContainer);
    setTimeout(() => ElementUtils.scrollToBottom(this.elementRef)); // timeout neeed when bubble font is large
    return messageElements;
  }

  private createAndPrependNewMessageElement(text: string, role: string, isTop: boolean) {
    const messageElements = this.createNewMessageElement(text, role, isTop);
    if (isTop && (this.elementRef.firstChild as HTMLElement)?.classList.contains('deep-chat-intro')) {
      (this.elementRef.firstChild as HTMLElement).insertAdjacentElement('afterend', messageElements.outerContainer);
      // swapping to place intro refs into correct position
      const introRefs = this.messageElementRefs[0];
      this.messageElementRefs[0] = this.messageElementRefs[1];
      this.messageElementRefs[1] = introRefs;
    } else {
      this.elementRef.insertBefore(messageElements.outerContainer, this.elementRef.firstChild);
    }
    return messageElements;
  }

  public createMessageElementsOnOrientation(text: string, role: string, isTop: boolean) {
    return isTop ? this.createAndPrependNewMessageElement(text, role, true) : this.createNewMessageElement(text, role);
  }

  public createNewMessageElement(text: string, role: string, isTop = false) {
    this._introPanel?.hide();
    const lastMessageElements = this.messageElementRefs[this.messageElementRefs.length - 1];
    LoadingHistory.changeFullViewToSmall(this, lastMessageElements);
    if (MessagesBase.isTemporaryElement(lastMessageElements)) {
      this.revealRoleElementsIfTempRemoved(lastMessageElements, role); // readding role elements to previous message
      lastMessageElements.outerContainer.remove();
      this.messageElementRefs.pop();
    }
    return this.createMessageElements(text, role, isTop);
  }

  // this can be tested by having an ai message, then a temp ai message with html that submits new user message:
  // https://github.com/OvidijusParsiunas/deep-chat/issues/258
  // prettier-ignore
  private revealRoleElementsIfTempRemoved(tempElements: MessageElements, newRole: string) {
    if ((this._avatars || this._names) && HTMLDeepChatElements.isElementTemporary(tempElements)) {
      // if prev message before temp has a different role to the new one, make sure its avatar is revealed
      const prevMessageElements = this.messageElementRefs[this.messageElementRefs.length - 2];
      if (prevMessageElements && this.messages[this.messages.length - 1]
        && !tempElements.bubbleElement.classList.contains(MessageUtils.getRoleClass(newRole))) {
        MessageUtils.revealRoleElements(prevMessageElements.innerContainer, this._avatars, this._names);
      }
    }
  }

  protected static isTemporaryElement(elements: MessageElements) {
    return MessagesBase.isLoadingMessage(elements) || HTMLDeepChatElements.isElementTemporary(elements);
  }

  public createMessageElements(text: string, role: string, isTop = false) {
    const messageElements = MessagesBase.createBaseElements();
    const { outerContainer, innerContainer, bubbleElement } = messageElements;
    outerContainer.appendChild(innerContainer);
    this.addInnerContainerElements(bubbleElement, text, role);
    MessageUtils.updateRefArr(this.messageElementRefs, messageElements, isTop);
    return messageElements;
  }

  protected static createBaseElements(): MessageElements {
    const outerContainer = document.createElement('div');
    const innerContainer = document.createElement('div');
    innerContainer.classList.add('inner-message-container');
    outerContainer.appendChild(innerContainer);
    outerContainer.classList.add('outer-message-container');
    const bubbleElement = document.createElement('div');
    bubbleElement.classList.add('message-bubble');
    innerContainer.appendChild(bubbleElement);
    return { outerContainer, innerContainer, bubbleElement };
  }

  // prettier-ignore
  private addInnerContainerElements(bubbleElement: HTMLElement, text: string, role: string) {
    if (this.messages[this.messages.length - 1]?.role === role && !this.isLastMessageError()) {
      MessageUtils.hideRoleElements(this.messageElementRefs, !!this._avatars, !!this._names);
    }
    bubbleElement.classList.add('message-bubble', MessageUtils.getRoleClass(role),
      role === MessageUtils.USER_ROLE ? 'user-message-text' : 'ai-message-text');
    this.renderText(bubbleElement, text);
    MessageUtils.addRoleElements(bubbleElement, role, this._avatars, this._names);
    return { bubbleElement };
  }

  // prettier-ignore
  public applyCustomStyles(elements: MessageElements | undefined, role: string, media: boolean,
    otherStyles?: MessageRoleStyles | MessageElementsStyles) {
    if (elements && this.messageStyles) {
      MessageStyleUtils.applyCustomStyles(this.messageStyles, elements, role, media, otherStyles);
    }
  }

  public static createMessageContent(content: Response): MessageContentI {
    // it is important to create a new object as its properties get manipulated later on e.g. delete message.html
    const { text, files, html, _sessionId, role } = content;
    const messageContent: MessageContentI = { role: role || MessageUtils.AI_ROLE };
    if (text) messageContent.text = text;
    if (files) messageContent.files = files;
    if (html) messageContent.html = html;
    if (!text && !files && !html) messageContent.text = '';
    if (_sessionId) messageContent._sessionId = _sessionId;
    return messageContent;
  }

  public removeMessage(messageElements: MessageElements) {
    messageElements.outerContainer.remove();
    const messageElementsIndex = this.messageElementRefs.findIndex((elRefs) => elRefs === messageElements);
    this.messageElementRefs.splice(messageElementsIndex, 1);
  }

  public removeLastMessage() {
    const lastMessage = this.messageElementRefs[this.messageElementRefs.length - 1];
    lastMessage.outerContainer.remove();
    this.messageElementRefs.pop();
  }

  public isLastMessageError() {
    return MessageUtils.getLastMessageBubbleElement(this.elementRef)?.classList.contains('error-message-text');
  }

  public static isLoadingMessage(elements?: MessageElements) {
    return elements?.bubbleElement.classList.contains(LoadingStyle.BUBBLE_CLASS);
  }

  public sendClientUpdate(message: MessageContentI, isHistory = false) {
    this._onMessage?.(message, isHistory);
  }

  public renderText(bubbleElement: HTMLElement, text: string) {
    // Ensure required scripts are loaded
    if (!document.querySelector('script[src*="zero-md"]')) {
      const zeroMdScript = document.createElement('script');
      zeroMdScript.type = 'module';
      zeroMdScript.src = 'https://cdn.jsdelivr.net/npm/zero-md@3/dist/zero-md.min.js';
      document.head.appendChild(zeroMdScript);
    }

    let processedText = text
      // Convert LaTeX style equations to markdown style
      .replace(/\\begin{equation}/g, '$$')
      .replace(/\\end{equation}/g, '$$')
      .replace(/\\\[(.*?)\\\]/g, '$$$$1$$')  // Convert \[...\] to $$...$$
      .replace(/\\\((.*?)\\\)/g, '$$$1$$');  // Convert \(...\) to $...$

    bubbleElement.innerHTML = '';

    const zeroMd = document.createElement('zero-md');

    // Set no-shadow attribute to allow styling
    zeroMd.setAttribute('no-shadow', '');

    // Enable math rendering
    zeroMd.setAttribute('math', '');

    const markdownSource = document.createElement('script');
    markdownSource.setAttribute('type', 'text/markdown');
    markdownSource.textContent = processedText;
    zeroMd.appendChild(markdownSource);

    const style = document.createElement('style');
    style.textContent = `
        .markdown-body {
            padding: 0;
            margin: 0;
            color: inherit;
            font-size: inherit;
            line-height: inherit;
            background: transparent;
        }
        .markdown-body .math {
            overflow-x: auto;
            margin: 1em 0;
        }
        .markdown-body .math-inline {
            display: inline-block;
            margin: 0;
        }
        .markdown-body .math-block {
            display: block;
            margin: 1em 0;
        }
        .markdown-body ol {
            padding-left: 1.5em;
            margin: 0.5em 0;
        }
        .markdown-body li {
            margin: 0.3em 0;
        }
        .markdown-body ul {
            list-style-type: disc;
            padding-left: 1.5em;
            margin: 0.5em 0;
        }
        .katex {
            font-size: 1.1em;
        }
        .katex-display {
            overflow-x: auto;
            overflow-y: hidden;
            padding: 0.5em 0;
            margin: 0.5em 0;
        }
        .katex-html {
            white-space: normal;
        }
    `;
    zeroMd.appendChild(style);

    bubbleElement.appendChild(zeroMd);

    // Optional: Add a fallback if zero-md fails to load
    if (!customElements.get('zero-md')) {
      const fallbackDiv = document.createElement('div');
      fallbackDiv.textContent = text;
      bubbleElement.appendChild(fallbackDiv);
    }

    // Force zero-md to re-render when math content is present
    setTimeout(() => {
      zeroMd.render();
    }, 100);
  }

  protected refreshTextMessages() {
    this.textElementsToText.forEach((elementToText) => {
      this.renderText(elementToText[0].bubbleElement, elementToText[1]);
    });
  }
}
