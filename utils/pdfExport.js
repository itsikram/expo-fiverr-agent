import { jsPDF } from 'jspdf';
import { formatTime } from './formatTime';

const isWeb = typeof window !== 'undefined' && typeof window.document !== 'undefined';

const normalizeSenderLabel = (message) => {
  if (!message) return 'Client';
  const sender = (message.sender || message.from || '').toString().toLowerCase();
  if (sender === 'me' || sender === 'user' || message.isFromMe) {
    return 'Me';
  }
  return 'Client';
};

const formatMessageTime = (time) => {
  if (!time) return 'Unknown time';
  const timestamp = typeof time === 'number' ? time : Date.parse(time);
  if (!timestamp || Number.isNaN(timestamp)) {
    return time.toString();
  }
  return formatTime(new Date(timestamp).toISOString());
};

const buildExportLines = (client, messages = []) => {
  const clientName = client?.name || client?.username || 'Unknown Client';
  const clientId = client?.conversationId || client?.username || client?.id || 'unknown';

  const lines = [
    `Client: ${clientName}`,
    `Username: ${client?.username || 'N/A'}`,
    `Conversation ID: ${clientId}`,
    `Exported: ${new Date().toLocaleString()}`,
    '------------------------------------------------------------',
    'Conversation messages',
    ' ',
  ];

  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a?.time ? Date.parse(a.time) : 0;
    const timeB = b?.time ? Date.parse(b.time) : 0;
    return timeA - timeB;
  });

  sortedMessages.forEach((message, index) => {
    const text = (message.text || message.content || '').toString();
    if (!text.trim()) return;

    lines.push(`Message ${index + 1}`);
    lines.push(`From: ${normalizeSenderLabel(message)}`);
    lines.push(`Time: ${formatMessageTime(message.time)}`);
    lines.push('');
    lines.push(text);
    lines.push(' ');
  });

  if (sortedMessages.length === 0) {
    lines.push('No messages currently available for this client.');
  }

  return lines;
};

export const exportClientMessagesPdf = async (client, messages = []) => {
  if (!isWeb) {
    throw new Error('PDF export is supported only on web.');
  }

  if (!client) {
    throw new Error('No client selected for export.');
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 16;
  const lines = buildExportLines(client, messages);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);

  let cursorY = margin;
  lines.forEach((line) => {
    const split = doc.splitTextToSize(line, maxWidth);
    const lineHeightForSplit = lineHeight * split.length;

    if (cursorY + lineHeightForSplit > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }

    doc.text(split, margin, cursorY);
    cursorY += lineHeightForSplit;
  });

  const fileName = `messages-${client?.username || client?.name || 'client'}-${new Date().getTime()}.pdf`;
  doc.save(fileName);
};
