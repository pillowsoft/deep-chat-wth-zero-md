import {CameraDimensions, CameraFiles} from '../../../../types/camera';
import {REFRESH_ICON_STRING} from '../../../../icons/refreshIcon';
import {CAPTURE_ICON_STRING} from '../../../../icons/captureIcon';
import {SVGIconUtils} from '../../../../utils/svg/svgIconUtils';
import {CLOSE_ICON_STRING} from '../../../../icons/closeIcon';
import {TICK_ICON_STRING} from '../../../../icons/tickIcon';
import {FileAttachmentsType} from './fileAttachmentsType';
import {CustomStyle} from '../../../../types/styles';
import {FileAttachments} from './fileAttachments';
import {Modal} from './modal';

export class CameraModal extends Modal {
  private _dataURL?: string;
  private _stopped = false;
  private readonly _captureButton: HTMLElement;
  private readonly _submitButton: HTMLElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _captureIcon: SVGGraphicsElement;
  private readonly _refreshIcon: SVGGraphicsElement;
  private _mediaStream?: MediaStream;
  private readonly _format: 'image/png' | 'image/jpeg' = 'image/png';
  private readonly _dimensions?: CameraDimensions;

  // prettier-ignore
  constructor(viewContainerElement: HTMLElement, fileAttachmentsType: FileAttachmentsType,
      containerStyle?: CustomStyle, cameraFiles?: CameraFiles) {
    super(viewContainerElement, ['modal-content', 'modal-camera-content'], containerStyle);
    this._canvas = document.createElement('canvas');
    this._canvas.classList.add('camera-modal-canvas');
    const {captureButton, submitButton} = this.addButtonsAndTheirEvents(fileAttachmentsType);
    this._captureButton = captureButton;
    this._submitButton = submitButton;
    this._captureIcon = this._captureButton.children[0] as SVGGraphicsElement;
    this._refreshIcon = SVGIconUtils.createSVGElement(REFRESH_ICON_STRING);
    this._refreshIcon.classList.add('modal-svg-button-icon', 'modal-svg-refresh-icon');
    if (cameraFiles?.format === 'jpeg') this._format = 'image/jpeg';
    if (cameraFiles?.dimensions) this._dimensions = cameraFiles.dimensions;
    this._contentRef.appendChild(this._canvas);
  }

  private addButtonsAndTheirEvents(fileAttachmentsType: FileAttachmentsType) {
    const captureButton = Modal.createSVGButton(CAPTURE_ICON_STRING);
    captureButton.classList.add('modal-svg-camera-button');
    captureButton.children[0].classList.add('modal-svg-camera-icon');
    const closeButton = this.addCloseButton(CLOSE_ICON_STRING, true);
    closeButton.classList.add('modal-svg-close-button');
    closeButton.children[0].classList.add('modal-svg-close-icon');
    const submitButton = Modal.createSVGButton(TICK_ICON_STRING);
    submitButton.classList.add('modal-svg-submit-button');
    this.addButtons(captureButton, submitButton);
    this.addButtonEvents(captureButton, closeButton, submitButton, fileAttachmentsType);
    return {captureButton, submitButton};
  }

  // prettier-ignore
  private addButtonEvents(captureButton: HTMLElement, closeButton: HTMLElement, submitButton: HTMLElement,
      fileAttachmentsType: FileAttachmentsType) {
    captureButton.onclick = () => {
      this.capture();
    };
    closeButton.addEventListener('click', this.stop.bind(this));
    submitButton.onclick = () => {
      const file = this.getFile();
      if (file) FileAttachments.addFiles([file], [fileAttachmentsType]);
      this.stop();
      this.close();
    };
  }

  private stop() {
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach((track) => track.stop());
    }
    this._stopped = true;
    setTimeout(() => {
      this._captureButton.replaceChildren(this._captureIcon);
      this._captureButton.classList.replace('modal-svg-refresh-button', 'modal-svg-camera-button');
      const ctx = this._canvas.getContext('2d');
      ctx?.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }, Modal.MODAL_CLOSE_TIMEOUT_MS);
  }

  start() {
    this._dataURL = undefined;
    this._submitButton.classList.add('modal-svg-submit-disabled');
    this._stopped = false;
    navigator.mediaDevices
      .getUserMedia({video: this._dimensions || true})
      .then((stream) => {
        this._mediaStream = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        requestAnimationFrame(this.updateCanvas.bind(this, video, this._canvas));
      })
      .catch((err) => console.error(err));
  }

  private capture() {
    if (this._dataURL) {
      this._captureButton.replaceChildren(this._captureIcon);
      this._captureButton.classList.replace('modal-svg-refresh-button', 'modal-svg-camera-button');
      this._submitButton.classList.add('modal-svg-submit-disabled');
      this._dataURL = undefined;
    } else {
      this._captureButton.replaceChildren(this._refreshIcon);
      this._captureButton.classList.replace('modal-svg-camera-button', 'modal-svg-refresh-button');
      this._submitButton.classList.remove('modal-svg-submit-disabled');
      this._dataURL = this._canvas.toDataURL();
    }
  }

  private getFile() {
    if (this._dataURL) {
      const binaryData = atob(this._dataURL.split(',')[1]);
      const byteNumbers = new Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        byteNumbers[i] = binaryData.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {type: this._format});
      const filename = CameraModal.getFileName();
      return new File([blob], filename, {type: blob.type});
    }
    return undefined;
  }

  private static getFileName() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `photo-${hours}-${minutes}-${seconds}.png`;
  }

  private updateCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    if (this._stopped) return;
    if (!this._dataURL) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(this.updateCanvas.bind(this, video, canvas));
  }

  private openCameraModal(cameraModal: CameraModal) {
    this.displayModalElements();
    cameraModal.start();
  }

  // prettier-ignore
  public static createCameraModalFunc(viewContainerElement: HTMLElement, fileAttachmentsType: FileAttachmentsType,
      modalContainerStyle?: CustomStyle, cameraFiles?: CameraFiles) {
    const cameraModal = new CameraModal(viewContainerElement, fileAttachmentsType, modalContainerStyle, cameraFiles);
    return cameraModal.openCameraModal.bind(cameraModal, cameraModal);
  }
}