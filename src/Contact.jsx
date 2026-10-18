// Developer contact (Home page footer, Control → status line → Contact dev)
import React from 'react'

export const DEV = {
  name: 'Pai Chanut',
  phone: '+66816351945',
  phoneShown: '+66 81 635 1945',
  whatsapp: 'https://wa.me/66816351945',
  line: 'https://line.me/ti/p/~paichanut',
  email: 'paichanut@gmail.com',
}

export function ContactLinks() {
  return (
    <div className="contactlinks">
      <a className="btn sm" href={`tel:${DEV.phone}`}>📞 {DEV.phoneShown}</a>
      <a className="btn sm wa" href={DEV.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className="btn sm line" href={DEV.line} target="_blank" rel="noreferrer">LINE</a>
      <a className="btn sm" href={`mailto:${DEV.email}`}>✉️ {DEV.email}</a>
    </div>
  )
}
