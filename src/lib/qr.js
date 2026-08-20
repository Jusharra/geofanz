import QRCode from 'qrcode'

export function tokenToDataUrl(token) {
  return QRCode.toDataURL(token, {
    width: 240,
    margin: 1,
    color: { dark: '#0a0a0f', light: '#ffffff' },
  })
}
