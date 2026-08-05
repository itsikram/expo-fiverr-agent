import { jsPDF } from "jspdf";
import { dedupeMessageImages } from "./clientIdentity";

const isWeb =
  typeof window !== "undefined" && typeof window.document !== "undefined";

const PAGE_MARGIN = 48;
const BUBBLE_PADDING = 14;
const BUBBLE_GAP = 14;
const TEXT_LINE_HEIGHT = 15;
const HEADER_LINE_HEIGHT = 14;
const LINK_LINE_HEIGHT = 14;
const IMAGE_GAP = 8;
const MAX_IMAGE_WIDTH = 260;
const MAX_IMAGE_HEIGHT = 180;
const LINK_COLOR = [37, 99, 235];
const MUTED_COLOR = [100, 106, 120];
const BODY_COLOR = [26, 26, 26];
const HEADER_COLOR = [55, 60, 70];

const CLIENT_BUBBLE_FILL = [244, 245, 251];
const CLIENT_BUBBLE_BORDER = [226, 228, 239];
const ME_BUBBLE_FILL = [232, 244, 253];
const ME_BUBBLE_BORDER = [201, 223, 240];

const normalizeSenderLabel = (message) => {
  if (!message) return "Client";
  const sender = (message.sender || message.from || "")
    .toString()
    .toLowerCase();
  if (sender === "me" || sender === "user" || message.isFromMe) {
    return "Me";
  }
  return "Client";
};

const formatExportTime = (time) => {
  if (!time) return "Unknown time";

  if (
    typeof time === "string" &&
    Number.isNaN(Date.parse(time)) &&
    (time.includes("AM") ||
      time.includes("PM") ||
      /[A-Za-z]{3}\s+\d{1,2}/.test(time))
  ) {
    return time;
  }

  const timestamp =
    typeof time === "number" ? time : Date.parse(time || "");
  if (!timestamp || Number.isNaN(timestamp)) {
    return String(time);
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getMessageLinks = (message) => {
  if (Array.isArray(message?.links)) {
    return message.links;
  }
  if (Array.isArray(message?.urls)) {
    return message.urls;
  }
  return [];
};

const getDomainFromUrl = (url) => {
  if (!url) return "link";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    const match = String(url).match(/https?:\/\/([^/?#]+)/i);
    return match ? match[1].replace(/^www\./i, "") : String(url);
  }
};

const isImageUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  return (
    /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(url) ||
    /cloudinary\.com/i.test(url) ||
    /fiverr-res\./i.test(url) ||
    /\/image\//i.test(url)
  );
};

const getAttachmentImageUrl = (attachment) =>
  attachment?.thumbnailUrl ||
  attachment?.thumbnail ||
  attachment?.url ||
  attachment?.href ||
  null;

const loadImageForPdf = async (url) => {
  if (!url || !isWeb) return null;

  const loadViaImage = () =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          resolve({
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            format: "JPEG",
          });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = reject;
      img.src = url;
    });

  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const dimensions = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({
            dataUrl,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            format: dataUrl.includes("image/png") ? "PNG" : "JPEG",
          });
        img.onerror = reject;
        img.src = dataUrl;
      });

      return dimensions;
    }
  } catch {
    // Fall back to canvas loading below.
  }

  try {
    return await loadViaImage();
  } catch {
    return null;
  }
};

const scaleImage = (width, height, maxWidth, maxHeight) => {
  if (!width || !height) {
    return { width: maxWidth, height: maxHeight * 0.5 };
  }
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, width * ratio),
    height: Math.max(1, height * ratio),
  };
};

const ensurePageSpace = (doc, cursorY, neededHeight, pageHeight) => {
  if (cursorY + neededHeight > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return cursorY;
};

const drawWrappedText = (doc, lines, x, y, lineHeight) => {
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
};

const prepareMessageBlock = async (message, doc, contentWidth) => {
  const senderLabel = normalizeSenderLabel(message);
  const isFromMe = senderLabel === "Me";
  const timeLabel = formatExportTime(message.time);
  const textContent = (message?.text || message?.content || "")
    .toString()
    .trim();

  const textLines = textContent
    ? doc.splitTextToSize(textContent, contentWidth)
    : [];

  const attachments = dedupeMessageImages(
    Array.isArray(message?.images)
      ? message.images
      : Array.isArray(message?.attachments)
        ? message.attachments
        : [],
  );

  const imageItems = [];
  for (const attachment of attachments) {
    const imageUrl = getAttachmentImageUrl(attachment);
    if (!isImageUrl(imageUrl)) {
      continue;
    }

    const loaded = await loadImageForPdf(imageUrl);
    if (!loaded) {
      continue;
    }

    const scaled = scaleImage(
      loaded.width,
      loaded.height,
      Math.min(MAX_IMAGE_WIDTH, contentWidth),
      MAX_IMAGE_HEIGHT,
    );

    imageItems.push({
      ...loaded,
      displayWidth: scaled.width,
      displayHeight: scaled.height,
    });
  }

  const links = getMessageLinks(message)
    .map((link) => ({
      href: link?.href || link?.url || null,
      domain: getDomainFromUrl(link?.href || link?.url),
    }))
    .filter((link) => link.href);

  const headerHeight = HEADER_LINE_HEIGHT + 6;
  const textHeight = textLines.length * TEXT_LINE_HEIGHT;
  const imagesHeight =
    imageItems.length > 0
      ? imageItems.reduce(
          (sum, item) => sum + item.displayHeight + IMAGE_GAP,
          0,
        ) - IMAGE_GAP
      : 0;
  const linksHeight =
    links.length > 0 ? 18 + links.length * LINK_LINE_HEIGHT : 0;

  const bodySections = [
    textHeight > 0 ? textHeight : 0,
    imagesHeight > 0 ? imagesHeight + (textHeight > 0 ? 10 : 0) : 0,
    linksHeight > 0
      ? linksHeight + (textHeight > 0 || imagesHeight > 0 ? 10 : 0)
      : 0,
  ];

  const contentHeight = bodySections.reduce((sum, value) => sum + value, 0);
  const blockHeight =
    BUBBLE_PADDING * 2 + headerHeight + Math.max(contentHeight, 12);

  return {
    senderLabel,
    timeLabel,
    isFromMe,
    textLines,
    imageItems,
    links,
    blockHeight,
    headerHeight,
  };
};

const drawMessageBlock = (doc, block, cursorY, bubbleX, bubbleWidth) => {
  const contentX = bubbleX + BUBBLE_PADDING;
  const contentWidth = bubbleWidth - BUBBLE_PADDING * 2;
  const fill = block.isFromMe ? ME_BUBBLE_FILL : CLIENT_BUBBLE_FILL;
  const border = block.isFromMe ? ME_BUBBLE_BORDER : CLIENT_BUBBLE_BORDER;

  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.75);
  doc.roundedRect(
    bubbleX,
    cursorY,
    bubbleWidth,
    block.blockHeight,
    8,
    8,
    "FD",
  );

  let textY = cursorY + BUBBLE_PADDING + 11;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...HEADER_COLOR);
  doc.text(`${block.senderLabel}  •  ${block.timeLabel}`, contentX, textY);

  textY += block.headerHeight;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BODY_COLOR);

  if (block.textLines.length > 0) {
    textY = drawWrappedText(
      doc,
      block.textLines,
      contentX,
      textY,
      TEXT_LINE_HEIGHT,
    );
  }

  if (block.imageItems.length > 0) {
    if (block.textLines.length > 0) {
      textY += 10;
    }

    block.imageItems.forEach((image) => {
      doc.addImage(
        image.dataUrl,
        image.format || "JPEG",
        contentX,
        textY,
        image.displayWidth,
        image.displayHeight,
        undefined,
        "FAST",
      );
      textY += image.displayHeight + IMAGE_GAP;
    });
  }

  if (block.links.length > 0) {
    if (block.textLines.length > 0 || block.imageItems.length > 0) {
      textY += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("LINKS", contentX, textY);
    textY += 14;

    block.links.forEach((link) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...LINK_COLOR);

      if (typeof doc.textWithLink === "function") {
        doc.textWithLink(link.domain, contentX, textY, { url: link.href });
      } else {
        doc.text(link.domain, contentX, textY);
        const linkWidth = doc.getTextWidth(link.domain);
        doc.link(contentX, textY - 10, linkWidth, 12, { url: link.href });
      }

      textY += LINK_LINE_HEIGHT;
    });
  }

  return cursorY + block.blockHeight + BUBBLE_GAP;
};

const patchPdfUriLinksForNewWindow = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let pdf = "";
  for (let index = 0; index < bytes.length; index += 1) {
    pdf += String.fromCharCode(bytes[index]);
  }

  const patched = pdf.replace(
    /(\/A\s*<<\s*\/S\s*\/URI\s*\/URI\s*\([^)]*\))(\s*>>)/g,
    (match, actionBody, close) => {
      if (actionBody.includes("/NewWindow")) {
        return match;
      }
      return `${actionBody} /NewWindow true${close}`;
    },
  );

  const output = new Uint8Array(patched.length);
  for (let index = 0; index < patched.length; index += 1) {
    output[index] = patched.charCodeAt(index);
  }
  return output.buffer;
};

const downloadPdfDocument = (doc, fileName) => {
  const patchedBuffer = patchPdfUriLinksForNewWindow(doc.output("arraybuffer"));
  const blob = new Blob([patchedBuffer], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
};

export const exportClientMessagesPdf = async (client, messages = []) => {
  if (!isWeb) {
    throw new Error("PDF export is supported only on web.");
  }

  if (!client) {
    throw new Error("No client selected for export.");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  const clientName = client?.name || client?.username || "Unknown Client";
  const clientId =
    client?.conversationId || client?.username || client?.id || "unknown";
  const exportDate = new Date().toLocaleString();

  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a?.time ? Date.parse(a.time) : 0;
    const timeB = b?.time ? Date.parse(b.time) : 0;
    return timeA - timeB;
  });

  doc.setFillColor(248, 249, 252);
  doc.rect(0, 0, pageWidth, 96, "F");
  doc.setDrawColor(226, 228, 239);
  doc.line(PAGE_MARGIN, 96, pageWidth - PAGE_MARGIN, 96);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text("Conversation Export", PAGE_MARGIN, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(55, 65, 81);
  doc.text(clientName, PAGE_MARGIN, 64);

  doc.setFontSize(10);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`@${client?.username || clientId}`, PAGE_MARGIN, 80);

  let cursorY = 118;

  const metadata = [
    ["Username", client?.username || "N/A"],
    ["Conversation ID", clientId],
    ["Messages", String(sortedMessages.length)],
    ["Exported", exportDate],
  ];

  metadata.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(label.toUpperCase(), PAGE_MARGIN, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BODY_COLOR);
    const valueLines = doc.splitTextToSize(String(value), contentWidth - 90);
    doc.text(valueLines, PAGE_MARGIN + 90, cursorY);
    cursorY += Math.max(valueLines.length * 12, 14) + 4;
  });

  cursorY += 10;
  doc.setDrawColor(226, 228, 239);
  doc.line(PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN, cursorY);
  cursorY += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text("Messages", PAGE_MARGIN, cursorY);
  cursorY += 18;

  if (sortedMessages.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(
      "No messages currently available for this client.",
      PAGE_MARGIN,
      cursorY,
    );
  } else {
    const bubbleWidth = contentWidth;
    const bubbleX = PAGE_MARGIN;

    for (const message of sortedMessages) {
      const block = await prepareMessageBlock(
        message,
        doc,
        bubbleWidth - BUBBLE_PADDING * 2,
      );

      cursorY = ensurePageSpace(doc, cursorY, block.blockHeight, pageHeight);
      cursorY = drawMessageBlock(
        doc,
        block,
        cursorY,
        bubbleX,
        bubbleWidth,
      );
    }
  }

  const fileName = `messages-${client?.username || client?.name || "client"}-${Date.now()}.pdf`;
  downloadPdfDocument(doc, fileName);
};
