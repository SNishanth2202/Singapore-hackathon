import { load } from 'cheerio';

/** All email providers in this app send plain text; never render model HTML. */
export function plainEmailBody(value: string): string {
  if (!/<\/?(?:br|p|div|html|body|span|a|ul|ol|li|script|style|table)\b/i.test(value)) return value.replace(/\r\n/g, '\n').trim();
  const document = load(value);
  document('script, style, iframe, object').remove();
  document('br').replaceWith('\n');
  document('p, div, tr, li').append('\n');
  return document('body').text().replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
