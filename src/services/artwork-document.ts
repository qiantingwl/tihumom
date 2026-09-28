// Use the evaluation viewport for thumbnails as well as detail previews.
// The original HTML stays untouched in storage and in code/download views.
export const ARTWORK_VIEWPORT = { width: 1200, height: 800 }

export function previewDocument(html: string, channel: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const style = doc.createElement('style')
  style.textContent = 'html,body{overflow:hidden!important;scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}'
  doc.head.append(style)
  const script = doc.createElement('script')
  script.textContent = `(() => {
    const measure = () => {
      const root = document.documentElement, body = document.body;
      parent.postMessage({type:'pelican-preview-size', channel:${JSON.stringify(channel)},
        width:Math.max(innerWidth,root.scrollWidth,body?.scrollWidth||0),
        height:Math.max(innerHeight,root.scrollHeight,body?.scrollHeight||0)}, '*');
    };
    // Report only once the document has painted with its initial font metrics.
    const ready = () => {
      const fonts = Promise.resolve(document.fonts?.ready);
      Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 120))])
        .then(() => requestAnimationFrame(() => requestAnimationFrame(measure)));
    };
    if (document.readyState === 'complete') ready();
    else addEventListener('load', ready, {once:true});
  })();`
  doc.body.append(script)
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML
}
