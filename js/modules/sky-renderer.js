/**
 * 星空可视化渲染器
 * - 绘制可视天球圆盘
 * - 绘制可见卫星（GPS 蓝，BDS 红）
 * - 提供命中检测
 */

export class SkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.hitCircles = []; // {satId,x,y,r,elDeg}
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(100, Math.floor(rect.width));
    const h = Math.max(100, Math.floor(rect.height));
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = w;
    this.height = h;
  }

  draw(state) {
    this.resize();
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(40, Math.min(w, h) * 0.42);

    // 背景圆盘
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#111f3b';
    ctx.fill();
    ctx.strokeStyle = '#2f4f8b';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 仰角圈：0/30/60/90
    ctx.strokeStyle = '#2b3f6a';
    ctx.lineWidth = 1;
    [0, 30, 60].forEach((el) => {
      const rr = R * (90 - el) / 90;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 方位十字
    ctx.strokeStyle = '#2b3f6a';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // 方位文字
    ctx.fillStyle = '#7594cc';
    ctx.font = '12px Microsoft YaHei';
    ctx.fillText('N', cx - 4, cy - R - 8);
    ctx.fillText('S', cx - 4, cy + R + 14);
    ctx.fillText('W', cx - R - 16, cy + 4);
    ctx.fillText('E', cx + R + 8, cy + 4);

    const visible = state.satellites.visible || [];
    this.hitCircles = [];

    for (const sat of visible) {
      const r = R * (90 - sat.elDeg) / 90;
      const azRad = sat.azDeg * Math.PI / 180;
      const x = cx + r * Math.sin(azRad);
      const y = cy - r * Math.cos(azRad);
      const pr = 11;

      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.fillStyle = sat.system === 'C' ? '#e24b5e' : '#2d8cff';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sat.satId.slice(1), x, y + 0.5);

      this.hitCircles.push({ satId: sat.satId, x, y, r: pr + 2, elDeg: sat.elDeg });
    }

    // 标题信息
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '12px Microsoft YaHei';
    ctx.fillStyle = '#7ea1df';
    ctx.fillText(`可见卫星: ${visible.length}`, 10, 18);
  }

  hitTest(cssX, cssY) {
    for (let i = this.hitCircles.length - 1; i >= 0; i--) {
      const p = this.hitCircles[i];
      const dx = cssX - p.x;
      const dy = cssY - p.y;
      if (dx * dx + dy * dy <= p.r * p.r) {
        return { satId: p.satId, elDeg: p.elDeg };
      }
    }
    return null;
  }
}
