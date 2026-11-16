/** พาธฐานของเว็บ เช่น "/ads-fah-marketing/crm" (ว่างถ้าโฮสต์ที่ root หรือเป็นโหมดสาธิต) */
export const BASE_PATH = import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') : ''
/** URL เต็มของหน้าในเว็บนี้ เช่น appUrl('/brief/abc') */
export const appUrl = (path: string) => `${window.location.origin}${BASE_PATH}${path}`
