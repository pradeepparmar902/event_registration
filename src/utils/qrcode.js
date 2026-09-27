const QRCode = require('qrcode');

async function qrPngDataUrl(text) {
  return QRCode.toDataURL(text, { margin: 1, width: 320 });
}

module.exports = { qrPngDataUrl };
