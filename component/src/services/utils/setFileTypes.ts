import { FileServiceIO, ServiceFileTypes, ServiceIO } from '../serviceIO';
import { FilesServiceConfig } from '../../types/fileServiceConfigs';
import { FileAttachments } from '../../types/fileAttachments';
import { Legacy } from '../../utils/legacy/legacy';
import { Connect } from '../../types/connect';
import { DeepChat } from '../../deepChat';


// Synchronous version of renderMDToText
function renderMDToTextSync(text: string): string {
  // Create a temporary div element
  const tempDiv = document.createElement('div');

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
    .replace(/\\\((.*?)\\\)/g, '$$$1$$')  // Convert \(...\) to $...$
    .replace(/\\\\/g, '\\');  // Remove double backslashes

  // Wrap equations in backticks to prevent further processing
  processedText = processedText.replace(/\$\$(.*?)\$\$/g, (_match, equation) => {
    return `\`${equation}\``;
  });

  const zeroMd = document.createElement('zero-md');

  // Set no-shadow attribute to allow styling
  zeroMd.setAttribute('no-shadow', '');

  // Enable math rendering
  zeroMd.setAttribute('math', '');

  const markdownSource = document.createElement('script');
  markdownSource.setAttribute('type', 'text/markdown');
  markdownSource.textContent = processedText;
  zeroMd.appendChild(markdownSource);

  tempDiv.appendChild(zeroMd);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (zeroMd as any).render();
  const renderedHTML = tempDiv.innerHTML;
  tempDiv.remove();

  return renderedHTML;
}

export class SetFileTypes {
  // prettier-ignore
  private static parseConfig(connectSettings: Connect, defFiles: FileAttachments,
    fileType?: boolean | FilesServiceConfig) {
    const fileConfig: FileServiceIO & { files: FileAttachments } = { files: defFiles };
    if (typeof fileType === 'object') {
      Legacy.processFileConfigConnect(fileType);
      const { files, connect, button } = fileType;
      if (files) {
        if (files.infoModal) {
          fileConfig.files.infoModal = files.infoModal;
          if (files.infoModal?.textMarkDown) {
            // TEST: ensure this works
            fileConfig.infoModalTextMarkUp = renderMDToTextSync(files.infoModal.textMarkDown);
          }
        }
        if (files.acceptedFormats) fileConfig.files.acceptedFormats = files.acceptedFormats;
        if (files.maxNumberOfFiles) fileConfig.files.maxNumberOfFiles = files.maxNumberOfFiles;
      }
      fileConfig.button = button;
      if (connect && (connect.headers || connect.method || connect.url || connect.credentials
        || connectSettings.headers || connectSettings.method || connectSettings.url || connectSettings.credentials)) {
        fileConfig.connect = {
          url: connect?.url || connectSettings.url,
          method: connect?.method || connectSettings.method,
          headers: connect?.headers || connectSettings.headers,
          credentials: connect?.credentials || connectSettings.credentials,
        };
      }
    }
    return fileConfig;
  }

  private static processMixedFiles(serviceIO: ServiceIO, mixedFiles: DeepChat['mixedFiles']) {
    if (mixedFiles) {
      const defFormats = { acceptedFormats: '' };
      serviceIO.fileTypes.mixedFiles = SetFileTypes.parseConfig(serviceIO.connectSettings, defFormats, mixedFiles);
    }
  }

  // needs to be set after audio to overwrite maxNumberOfFiles
  // prettier-ignore
  private static processMicrophone(
    serviceIO: ServiceIO, microphone: DeepChat['microphone'], audio: DeepChat['audio']) {
    const files = serviceIO.fileTypes.audio?.files || {};
    const defaultFormats = { acceptedFormats: 'audio/*', ...files };
    if (!microphone) return;
    if (navigator.mediaDevices.getUserMedia !== undefined) {
      serviceIO.recordAudio = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, microphone);
      // adding configuration that parseConfig does not add (don't want to overwrite as it may have processed properties)
      if (typeof microphone === 'object') {
        if (microphone.files) {
          serviceIO.recordAudio.files ??= {}; // for typescript
          serviceIO.recordAudio.files.format = microphone.files?.format;
          // this.recordAudio.files.newFilePrefix = customService.microphone.files?.newFilePrefix;
          serviceIO.recordAudio.files.maxDurationSeconds = microphone.files?.maxDurationSeconds;
          if (serviceIO.fileTypes.audio?.files) {
            serviceIO.fileTypes.audio.files.maxNumberOfFiles ??= microphone.files.maxNumberOfFiles;
          }
        }
      }
      // if microphone is not available - fallback to normal audio upload
    } else if (!audio) {
      serviceIO.fileTypes.audio = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, microphone);
    }
  }

  // prettier-ignore
  private static processAudioConfig(
    serviceIO: ServiceIO, audio: DeepChat['audio'], fileIO?: FileServiceIO) {
    if (!audio && !fileIO) return;
    const files = fileIO?.files || {};
    const defaultFormats = { acceptedFormats: 'audio/*', ...files };
    // make sure to set these in the right services
    serviceIO.fileTypes.audio = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, audio);
  }

  // prettier-ignore
  private static processGifConfig(
    serviceIO: ServiceIO, gifs: DeepChat['gifs'], fileIO?: FileServiceIO) {
    if (!gifs && !fileIO) return;
    const files = fileIO?.files || {};
    const defaultFormats = { acceptedFormats: 'image/gif', ...files };
    // make sure to set these in the right services
    serviceIO.fileTypes.gifs = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, gifs);
  }

  // needs to be set after images to overwrite maxNumberOfFiles
  // prettier-ignore
  private static processCamera(
    serviceIO: ServiceIO, camera: DeepChat['camera'], images?: DeepChat['images']) {
    const files = serviceIO.fileTypes.images?.files || {};
    const defaultFormats = { acceptedFormats: 'image/*', ...files };
    if (!camera) return;
    if (navigator.mediaDevices.getUserMedia !== undefined) {
      // check how maxNumberOfFiles is set here - if user has set in images - should use that instead
      serviceIO.camera = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, camera);
      if (typeof camera === 'object') {
        serviceIO.camera.modalContainerStyle = camera.modalContainerStyle;
        // adding configuration that parseConfig does not add (don't want to overwrite as it may have processed properties)
        if (camera.files) {
          serviceIO.camera.files ??= {}; // for typescript
          serviceIO.camera.files.format = camera.files?.format;
          // this.camera.files.newFilePrefix = customService.camera.files?.newFilePrefix; // can implement in the future
          serviceIO.camera.files.dimensions = camera.files?.dimensions;
        }
      }
      // if camera is not available - fallback to normal image upload
    } else if (!images) {
      serviceIO.fileTypes.images = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, camera);
    }
  }

  // prettier-ignore
  private static processImagesConfig(
    serviceIO: ServiceIO, images: DeepChat['images'], fileIO?: FileServiceIO) {
    if (!images && !fileIO) return;
    const files = fileIO?.files || {};
    const defaultFormats = { acceptedFormats: 'image/*', ...files };
    // make sure to set these in the right services
    serviceIO.fileTypes.images = SetFileTypes.parseConfig(serviceIO.connectSettings, defaultFormats, images);
  }

  // default for direct service
  private static populateDefaultFileIO(fileIO: FileServiceIO | undefined, acceptedFormats: string) {
    if (fileIO) {
      fileIO.files ??= {};
      fileIO.files.acceptedFormats ??= acceptedFormats;
      fileIO.files.maxNumberOfFiles ??= 1;
    }
  }

  public static set(deepChat: DeepChat, serviceIO: ServiceIO, existingFileTypes?: ServiceFileTypes) {
    SetFileTypes.populateDefaultFileIO(existingFileTypes?.audio, '.4a,.mp3,.webm,.mp4,.mpga,.wav,.mpeg,.m4a');
    SetFileTypes.populateDefaultFileIO(existingFileTypes?.images, '.png,.jpg');
    SetFileTypes.processImagesConfig(serviceIO, deepChat.images, existingFileTypes?.images);
    SetFileTypes.processCamera(serviceIO, deepChat.camera, deepChat.images);
    SetFileTypes.processGifConfig(serviceIO, deepChat.gifs, existingFileTypes?.gifs);
    SetFileTypes.processAudioConfig(serviceIO, deepChat.audio, existingFileTypes?.audio);
    SetFileTypes.processMicrophone(serviceIO, deepChat.microphone, deepChat.audio);
    SetFileTypes.processMixedFiles(serviceIO, deepChat.mixedFiles);
  }
}
