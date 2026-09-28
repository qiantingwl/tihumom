const styles = `
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:#d9f3ef;font-family:system-ui;color:#18352d}
  .scene{position:relative;width:100%;height:100vh;min-height:360px;background:linear-gradient(#c9f1f0 0 56%,#86d7d0 57% 70%,#e8d39e 71%)}
  .sun{position:absolute;right:10%;top:10%;width:70px;height:70px;border-radius:50%;background:#f7c95f;box-shadow:0 0 0 16px #fff6bd88}
  .hill{position:absolute;left:-5%;right:-5%;top:43%;height:24%;background:#57b7a8;clip-path:polygon(0 70%,18% 18%,35% 65%,57% 5%,76% 62%,100% 20%,100% 100%,0 100%)}
  .bike{position:absolute;left:50%;top:57%;width:340px;height:170px;transform:translate(-50%,-50%)}
  .wheel{position:absolute;bottom:0;width:112px;height:112px;border:8px solid #204f48;border-radius:50%;background:repeating-conic-gradient(#204f48 0 1deg,transparent 1deg 20deg);animation:spin 2.4s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .wheel.a{left:18px}.wheel.b{right:16px}.frame{position:absolute;left:76px;top:75px;width:175px;height:70px;border:9px solid #df7558;clip-path:polygon(0 100%,28% 0,55% 100%,100% 100%,74% 0,68% 0,51% 82%,33% 8%,8% 100%)}
  .bird{position:absolute;left:115px;top:4px;width:128px;height:92px;border:5px solid #204f48;border-radius:55% 48% 45% 55%;background:#fffdf5;transform:rotate(4deg);animation:bob 1.2s ease-in-out infinite alternate}
  @keyframes bob{from{transform:rotate(2deg) translateY(0)}to{transform:rotate(6deg) translateY(-4px)}}
  .bird:before{content:'';position:absolute;right:-76px;top:20px;width:90px;height:34px;background:#f5b94f;border:5px solid #204f48;border-radius:10% 80% 80% 20%;transform:skewX(-18deg)}
  .eye{position:absolute;right:20px;top:14px;width:8px;height:8px;border-radius:50%;background:#173f38}.wing{position:absolute;left:17px;top:36px;width:64px;height:35px;border:4px solid #6c968e;border-radius:60% 30% 60% 30%;transform:rotate(12deg)}
  .scarf{position:absolute;left:105px;top:30px;width:58px;height:15px;border-radius:10px;background:#e66f55;transform:rotate(10deg)}
  .caption{position:absolute;left:5%;bottom:5%;font-size:14px;font-weight:700;letter-spacing:.08em;background:rgba(255,255,255,0.85);padding:4px 10px;border-radius:6px}.cloud{position:absolute;top:18%;left:14%;width:110px;height:30px;border-radius:30px;background:#fff9}.cloud:after{content:'';position:absolute;left:30px;top:-20px;width:50px;height:50px;border-radius:50%;background:#fff}
`

export function createDemoHtml(label = '鹈鹕妈妈固定题') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${styles}</style></head><body><main class="scene"><div class="sun"></div><div class="cloud"></div><div class="hill"></div><div class="bike"><div class="wheel a"></div><div class="wheel b"></div><div class="frame"></div><div class="bird"><i class="eye"></i><i class="wing"></i></div><div class="scarf"></div></div><div class="caption">${label}</div></main></body></html>`
}

export function createDemoCandyResponse(passed = true) {
  if (passed) {
    return `解题分析：
根据题目条件：
袋中有三种口味糖果：苹果、桃子、西瓜。
通过手感只能区分形状（圆形和五角星形），无法直接感知口味。
数量统计：
- 圆形：苹果 7 个，桃子 9 个，西瓜 8 个（共 24 个）
- 五角星形：苹果 7 个，桃子 6 个，西瓜 4 个（共 17 个）
总共有 41 个糖果。

我们要保证**同时拥有不同形状的苹果味和桃子味糖果**，即：
1. 至少有 1 个圆形苹果味和 1 个五角星形桃子味；或者
2. 至少有 1 个五角星形苹果味和 1 个圆形桃子味。

考虑最坏情况（极值鸽巢原理）：
若要避开同时凑齐的情况，先取出尽可能多无法满足要求的糖果。
通过穷举两个维度的最不利组合分析，当取出数量达到最坏临界值后，再取 1 个即可必然保证满足条件。
经过严格极值穷举计算：
最少需要取的糖果总数是 21 个。
FINAL_ANSWER: 21`
  }
  return `解题分析：
袋子里苹果味有 14 个，桃子味有 15 个，西瓜味有 12 个。
按手感可以区分圆形和五角星形。
为了保证拿到不同形状的苹果和桃子，我们各取一半：
圆形取 6 个，五角星形取 6 个，所以总共最少需要取 12 个。`
}
