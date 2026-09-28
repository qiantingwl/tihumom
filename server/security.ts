import { lookup } from 'node:dns/promises'
import { lookup as dnsLookup } from 'node:dns'
import ipaddr from 'ipaddr.js'

export function isPublicIp(address: string) {
  try {
    return ipaddr.process(address.replace(/^\[|\]$/g, '')).range() === 'unicast'
  } catch {
    return false
  }
}
export function normalizeEndpoint(raw: string) {
  const text = raw.trim()
  const url = new URL(text.includes('://') ? text : `https://${text}`)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '443')
  )
    throw new Error('接口须为 HTTPS 地址，不能含凭据、查询参数或非默认端口')
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/v1/responses'
  else if (/\/v1\/?$/.test(url.pathname))
    url.pathname = url.pathname.replace(/\/$/, '') + '/responses'
  if (!/\/(responses|chat\/completions)$/.test(url.pathname))
    throw new Error('请填写 Responses 或 Chat Completions 接口地址')
  return url
}
export async function assertSafeEndpoint(raw: string) {
  const url = normalizeEndpoint(raw),
    host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || /\.(local|internal|localhost)$/.test(host))
    throw new Error('接口地址不能指向本机或内网')
  const records = ipaddr.isValid(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true })
  if (!records.length || records.some((r) => !isPublicIp(r.address)))
    throw new Error('接口地址解析到了不可访问的内网或保留地址')
  return url
}
export const safeLookup: typeof dnsLookup = ((hostname: string, options: any, callback: any) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error)
    if (!addresses.length || addresses.some((r) => !isPublicIp(r.address)))
      return callback(new Error('不允许连接内网地址'))
    const filtered = options?.family
      ? addresses.filter((r) => r.family === options.family)
      : addresses
    if (!filtered.length) return callback(new Error('没有可用的公网地址'))
    if (options?.all) callback(null, filtered)
    else callback(null, filtered[0].address, filtered[0].family)
  })
}) as typeof dnsLookup
