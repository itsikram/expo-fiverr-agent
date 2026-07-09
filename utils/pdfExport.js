import { jsPDF } from "jspdf";
import { formatTime } from "./formatTime";

const isWeb =
  typeof window !== "undefined" && typeof window.document !== "undefined";

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

const formatMessageTime = (time) => {
  if (!time) return "Unknown time";
  const timestamp = typeof time === "number" ? time : Date.parse(time);
  if (!timestamp || Number.isNaN(timestamp)) {
    return time.toString();
  }
  return formatTime(new Date(timestamp).toISOString());
};

const getMessageAttachments = (message) => {
  if (Array.isArray(message?.images)) {
    return message.images;
  }
  if (Array.isArray(message?.attachments)) {
    return message.attachments;
  }
  return [];
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

const getMessageContentLines = (message, bubbleWidth, doc) => {
  const lines = [];
  const textContent = (message?.text || message?.content || "")
    .toString()
    .trim();

  if (textContent) {
    lines.push(...doc.splitTextToSize(textContent, bubbleWidth));
  }

  const attachments = getMessageAttachments(message);
  if (attachments.length > 0) {
    lines.push("Attachments:");
    attachments.forEach((attachment) => {
      const url = attachment?.url || attachment?.href || null;
      const label =
        attachment?.title ||
        attachment?.name ||
        url?.split("/").pop() ||
        "Attachment";
      lines.push(...doc.splitTextToSize(label, bubbleWidth));
      if (url) {
        lines.push(...doc.splitTextToSize(url, bubbleWidth));
      }
    });
  }

  const links = getMessageLinks(message);
  if (links.length > 0) {
    lines.push("Links:");
    links.forEach((link, index) => {
      const href = link?.href || link?.url || null;
      const label = link?.text || link?.title || href || `Link ${index + 1}`;
      lines.push(...doc.splitTextToSize(label, bubbleWidth));
      if (href) {
        lines.push(...doc.splitTextToSize(href, bubbleWidth));
      }
    });
  }

  return lines.length > 0 ? lines : ["No content available."];
};

export const exportClientMessagesPdf = async (client, messages = []) => {
  if (!isWeb) {
    throw new Error("PDF export is supported only on web.");
  }

  if (!client) {
    throw new Error("No client selected for export.");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const bubblePadding = 12;
  const textLineHeight = 16;
  const sectionGap = 18;

  const clientName = client?.name || client?.username || "Unknown Client";
  const clientId =
    client?.conversationId || client?.username || client?.id || "unknown";
  const exportDate = new Date().toLocaleString();

  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a?.time ? Date.parse(a.time) : 0;
    const timeB = b?.time ? Date.parse(b.time) : 0;
    return timeA - timeB;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Message Export for ${clientName}`, margin, margin);

  let cursorY = margin + 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const metadataLines = [
    `Username: ${client?.username || "N/A"}`,
    `Conversation ID: ${clientId}`,
    `Exported: ${exportDate}`,
  ];

  metadataLines.forEach((line) => {
    const split = doc.splitTextToSize(line, maxWidth);
    const height = split.length * textLineHeight;
    if (cursorY + height > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    doc.text(split, margin, cursorY);
    cursorY += height;
  });

  cursorY += sectionGap;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Conversation Messages", margin, cursorY);
  cursorY += 20;

  if (sortedMessages.length === 0) {
    const emptyText = "No messages currently available for this client.";
    const emptySplit = doc.splitTextToSize(emptyText, maxWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(emptySplit, margin, cursorY);
  } else {
    sortedMessages.forEach((message, index) => {
      const senderLabel = normalizeSenderLabel(message);
      const timeLabel = formatMessageTime(message.time);
      const bubbleX = margin;
      const bubbleWidth = maxWidth - bubblePadding * 2;
      const contentLines = getMessageContentLines(message, bubbleWidth, doc);
      const headerLines = [`${senderLabel} • ${timeLabel}`];
      const headerHeight = headerLines.length * textLineHeight;
      const textHeight = contentLines.length * textLineHeight;
      const bubbleHeight = headerHeight + textHeight + bubblePadding * 2;

      if (cursorY + bubbleHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }

      doc.setFillColor(
        message.isFromMe || senderLabel === "Me" ? 225 : 245,
        245,
        255,
      );
      doc.setDrawColor(200);
      doc.rect(bubbleX, cursorY, bubbleWidth, bubbleHeight, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(
        headerLines,
        bubbleX + bubblePadding,
        cursorY + bubblePadding + 10,
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text(
        contentLines,
        bubbleX + bubblePadding,
        cursorY + bubblePadding + headerHeight + 6,
      );

      cursorY += bubbleHeight + sectionGap;
    });
  }

  const fileName = `messages-${client?.username || client?.name || "client"}-${new Date().getTime()}.pdf`;
  doc.save(fileName);
};
