import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export const MAX_AI_ATTACHMENTS = 5;
export const MAX_AI_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const IMAGE_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

const guessMimeType = (name = '', fallback = 'application/octet-stream') => {
  const ext = String(name).split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'application/pdf';
  return IMAGE_MIME_BY_EXT[ext] || fallback;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeAttachment = ({
  uri,
  name,
  mimeType,
  size,
  kind,
}) => {
  const safeName = name || (kind === 'pdf' ? 'document.pdf' : 'image.jpg');
  const safeMime =
    mimeType ||
    guessMimeType(safeName, kind === 'pdf' ? 'application/pdf' : 'image/jpeg');
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    uri,
    name: safeName,
    mimeType: safeMime,
    size: typeof size === 'number' ? size : null,
    sizeLabel: formatBytes(size),
    kind: kind || (safeMime === 'application/pdf' ? 'pdf' : 'image'),
  };
};

export const attachmentsToMessageImages = (attachments = []) =>
  attachments.map((item) => ({
    url: item.uri,
    href: item.uri,
    thumbnailUrl: item.kind === 'image' ? item.uri : null,
    title: item.name,
    name: item.name,
    size: item.sizeLabel || undefined,
    mimeType: item.mimeType,
    kind: item.kind,
  }));

const ensureRoom = (existingCount, incomingCount) => {
  if (existingCount + incomingCount <= MAX_AI_ATTACHMENTS) return true;
  Alert.alert(
    'Attachment limit',
    `You can attach up to ${MAX_AI_ATTACHMENTS} files per message.`
  );
  return false;
};

const rejectIfTooLarge = (size, name) => {
  if (typeof size === 'number' && size > MAX_AI_ATTACHMENT_BYTES) {
    Alert.alert(
      'File too large',
      `"${name || 'File'}" exceeds the ${formatBytes(MAX_AI_ATTACHMENT_BYTES)} limit.`
    );
    return true;
  }
  return false;
};

export const pickAiChatImages = async (existingCount = 0) => {
  const remaining = MAX_AI_ATTACHMENTS - existingCount;
  if (remaining <= 0) {
    ensureRoom(existingCount, 1);
    return [];
  }

  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to attach images to AI chat.'
      );
      return [];
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.85,
    base64: false,
  });

  if (result.canceled || !Array.isArray(result.assets)) return [];

  const attachments = [];
  for (const asset of result.assets) {
    if (!asset?.uri) continue;
    const name =
      asset.fileName ||
      asset.uri.split('/').pop() ||
      `image-${attachments.length + 1}.jpg`;
    if (rejectIfTooLarge(asset.fileSize, name)) continue;
    attachments.push(
      normalizeAttachment({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || guessMimeType(name, 'image/jpeg'),
        size: asset.fileSize,
        kind: 'image',
      })
    );
  }

  if (!ensureRoom(existingCount, attachments.length)) {
    return attachments.slice(0, remaining);
  }
  return attachments;
};

export const pickAiChatPdfs = async (existingCount = 0) => {
  const remaining = MAX_AI_ATTACHMENTS - existingCount;
  if (remaining <= 0) {
    ensureRoom(existingCount, 1);
    return [];
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: remaining > 1,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !Array.isArray(result.assets)) return [];

  const attachments = [];
  for (const asset of result.assets.slice(0, remaining)) {
    if (!asset?.uri) continue;
    const name = asset.name || `document-${attachments.length + 1}.pdf`;
    if (rejectIfTooLarge(asset.size, name)) continue;
    attachments.push(
      normalizeAttachment({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || 'application/pdf',
        size: asset.size,
        kind: 'pdf',
      })
    );
  }

  return attachments;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  if (typeof btoa === 'function') return btoa(binary);
  // eslint-disable-next-line no-undef
  return Buffer.from(binary, 'binary').toString('base64');
};

export const readAttachmentBase64 = async (attachment) => {
  if (!attachment?.uri) {
    throw new Error('Attachment is missing a file URI.');
  }

  if (attachment.base64) {
    return {
      mimeType: attachment.mimeType || 'application/octet-stream',
      base64: attachment.base64,
      name: attachment.name,
      kind: attachment.kind,
    };
  }

  try {
    const response = await fetch(attachment.uri);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      if (buffer?.byteLength) {
        if (buffer.byteLength > MAX_AI_ATTACHMENT_BYTES) {
          throw new Error(
            `"${attachment.name || 'File'}" exceeds the ${formatBytes(MAX_AI_ATTACHMENT_BYTES)} limit.`
          );
        }
        return {
          mimeType: attachment.mimeType || 'application/octet-stream',
          base64: arrayBufferToBase64(buffer),
          name: attachment.name,
          kind: attachment.kind,
        };
      }
    }
  } catch (error) {
    if (/exceeds the/i.test(error?.message || '')) throw error;
  }

  const base64 = await FileSystem.readAsStringAsync(attachment.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    mimeType: attachment.mimeType || 'application/octet-stream',
    base64,
    name: attachment.name,
    kind: attachment.kind,
  };
};

export const prepareAttachmentsForApi = async (attachments = []) => {
  const prepared = [];
  for (const item of attachments) {
    prepared.push(await readAttachmentBase64(item));
  }
  return prepared;
};

export const toDataUri = (mimeType, base64) =>
  `data:${mimeType || 'image/png'};base64,${base64}`;

/** Detect free-form requests that should use image generation instead of text chat. */
export const shouldGenerateAiImage = (text = '') => {
  const value = String(text || '').trim();
  if (!value) return false;

  // Avoid colliding with existing "generate next message" / reply presets.
  if (
    /\b(next message|first message|reply|quotation|pricing message|cursor prompt|chatgpt prompt)\b/i.test(
      value
    )
  ) {
    return false;
  }

  return (
    /\b(generate|create|make|draw|design|render|illustrate)\b[\s\S]{0,40}\b(image|picture|photo|illustration|logo|banner|icon|artwork|graphic|poster)\b/i.test(
      value
    ) ||
    /\b(image|picture|photo|illustration|logo|banner|icon)\b[\s\S]{0,20}\b(of|with|showing|for)\b/i.test(
      value
    ) ||
    /^(an?\s+)?(image|picture|illustration|logo|banner)\s+(of|with)\b/i.test(value)
  );
};
