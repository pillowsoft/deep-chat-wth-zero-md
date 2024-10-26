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
  private zeroMdLoaded = false;
  private renderQueue: Array<() => void> = [];
  private messageUpdateDebounceTimers: Map<HTMLElement, number> = new Map();

  constructor(deepChat: DeepChat) {
    this.elementRef = MessagesBase.createContainerElement();
    this.messageStyles = deepChat.messageStyles;
    this._avatars = deepChat.avatars;
    this._names = deepChat.names;
    this._onMessage = FireEvents.onMessage.bind(this, deepChat);
    if (deepChat.htmlClassUtilities) this.htmlClassUtilities = deepChat.htmlClassUtilities;

    // Ensure both scripts are loaded in the correct order
    if (!document.querySelector('script[src*="marked"]')) {
      const markedScript = document.createElement('script');
      markedScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      document.head.appendChild(markedScript);

      markedScript.onload = () => {
        if (!document.querySelector('script[src*="zero-md"]')) {
          const zeroMdScript = document.createElement('script');
          zeroMdScript.type = 'module';
          zeroMdScript.src = 'https://cdn.jsdelivr.net/npm/zero-md@3?register';
          document.head.appendChild(zeroMdScript);

          zeroMdScript.onload = () => {
            const checkInterval = setInterval(() => {
              if (customElements.get('zero-md')) {
                clearInterval(checkInterval);
                this.zeroMdLoaded = true;
                this.processRenderQueue();
                this.refreshTextMessages();
              }
            }, 50);
          };
        }
      };
    } else if (!document.querySelector('script[src*="zero-md"]')) {
      const zeroMdScript = document.createElement('script');
      zeroMdScript.type = 'module';
      zeroMdScript.src = 'https://cdn.jsdelivr.net/npm/zero-md@3?register';
      document.head.appendChild(zeroMdScript);

      zeroMdScript.onload = () => {
        const checkInterval = setInterval(() => {
          if (customElements.get('zero-md')) {
            clearInterval(checkInterval);
            this.zeroMdLoaded = true;
            this.processRenderQueue();
            this.refreshTextMessages();
          }
        }, 50);
      };
    } else {
      this.zeroMdLoaded = true;
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
    setTimeout(() => ElementUtils.scrollToBottom(this.elementRef));
    return messageElements;
  }

  private createAndPrependNewMessageElement(text: string, role: string, isTop: boolean) {
    const messageElements = this.createNewMessageElement(text, role, isTop);
    if (isTop && (this.elementRef.firstChild as HTMLElement)?.classList.contains('deep-chat-intro')) {
      (this.elementRef.firstChild as HTMLElement).insertAdjacentElement('afterend', messageElements.outerContainer);
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
      this.revealRoleElementsIfTempRemoved(lastMessageElements, role);
      lastMessageElements.outerContainer.remove();
      this.messageElementRefs.pop();
    }
    return this.createMessageElements(text, role, isTop);
  }

  private revealRoleElementsIfTempRemoved(tempElements: MessageElements, newRole: string) {
    if ((this._avatars || this._names) && HTMLDeepChatElements.isElementTemporary(tempElements)) {
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

  public applyCustomStyles(elements: MessageElements | undefined, role: string, media: boolean,
    otherStyles?: MessageRoleStyles | MessageElementsStyles) {
    if (elements && this.messageStyles) {
      MessageStyleUtils.applyCustomStyles(this.messageStyles, elements, role, media, otherStyles);
    }
  }

  public static createMessageContent(content: Response): MessageContentI {
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
    const timer = this.messageUpdateDebounceTimers.get(messageElements.bubbleElement);
    if (timer) {
      window.clearTimeout(timer);
      this.messageUpdateDebounceTimers.delete(messageElements.bubbleElement);
    }
    messageElements.outerContainer.remove();
    const messageElementsIndex = this.messageElementRefs.findIndex((elRefs) => elRefs === messageElements);
    this.messageElementRefs.splice(messageElementsIndex, 1);
  }

  public removeLastMessage() {
    const lastMessage = this.messageElementRefs[this.messageElementRefs.length - 1];
    if (lastMessage) {
      const timer = this.messageUpdateDebounceTimers.get(lastMessage.bubbleElement);
      if (timer) {
        window.clearTimeout(timer);
        this.messageUpdateDebounceTimers.delete(lastMessage.bubbleElement);
      }
      lastMessage.outerContainer.remove();
      this.messageElementRefs.pop();
    }
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

  private processRenderQueue() {
    while (this.renderQueue.length > 0) {
      const render = this.renderQueue.shift();
      render?.();
    }
  }

  public renderText(bubbleElement: HTMLElement, text: string) {
    const existingTimer = this.messageUpdateDebounceTimers.get(bubbleElement);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const renderFunction = () => {
      let processedText = text
        .replace(/\\begin{equation}/g, '$$')
        .replace(/\\end{equation}/g, '$$')
        .replace(/\\\[(.*?)\\\]/g, '$$$$1$$')
        .replace(/\\\((.*?)\\\)/g, '$$$1$$')
        .replace(/\\\\/g, '\\');

      processedText = processedText.replace(/\$\$(.*?)\$\$/g, (_match, equation) => {
        return `\`${equation}\``;
      });

      let zeroMd = bubbleElement.querySelector('zero-md');
      const existingContent = zeroMd?.querySelector('script[type="text/markdown"]')?.textContent;

      // Skip if content hasn't changed
      if (existingContent === processedText) {
        return;
      }

      // Create zero-md element if it doesn't exist
      if (!zeroMd) {
        bubbleElement.innerHTML = '';
        zeroMd = document.createElement('zero-md');
        zeroMd.setAttribute('no-shadow', '');

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
        `;
        zeroMd.appendChild(style);
        bubbleElement.appendChild(zeroMd);
      }

      // Always create a new script element to trigger a re-render
      zeroMd.querySelectorAll('script[type="text/markdown"]').forEach(el => el.remove());
      const markdownSource = document.createElement('script');
      markdownSource.setAttribute('type', 'text/markdown');
      markdownSource.textContent = processedText;
      zeroMd.appendChild(markdownSource);
    };

    if (!this.zeroMdLoaded) {
      this.renderQueue.push(renderFunction);
      return;
    }

    // For streaming messages, debounce slightly to improve performance
    // For history messages, render immediately
    const isStreaming = bubbleElement.parentElement?.classList.contains('typing');
    if (isStreaming) {
      const newTimer = window.setTimeout(() => {
        renderFunction();
        this.messageUpdateDebounceTimers.delete(bubbleElement);
      }, 30); // Short debounce for smooth streaming
      this.messageUpdateDebounceTimers.set(bubbleElement, newTimer);
    } else {
      renderFunction();
    }
  }

  protected refreshTextMessages() {
    if (!this.zeroMdLoaded) {
      this.renderQueue.push(() => this.refreshTextMessages());
      return;
    }

    this.textElementsToText.forEach((elementToText) => {
      this.renderText(elementToText[0].bubbleElement, elementToText[1]);
    });
  }
}