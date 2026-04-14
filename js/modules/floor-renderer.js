import { llaToEcef, ecefToLla, ecefToEnu, enuToEcef } from './coordinates.js';

export class FloorRenderer {
  constructor(floorCanvas, antennaCanvas) {
    this.floorCanvas = floorCanvas;
    this.floorCtx = floorCanvas.getContext('2d');
    this.antennaCanvas = antennaCanvas;
    this.antennaCtx = antennaCanvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.floorFrame = {
      x: 40,
      y: 30,
      w: 300,
      h: 200,
      pxPerMeter: 20
    };

    this.hitFloorPoints = []; // {id,x,y,r}
    this.hitSimPoints = [];   // {simId,floorPointId,x,y,r}
    this.hitAntennas = [];    // {id,x,y,r}
  }

  resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, Math.floor(rect.width));
    const h = Math.max(80, Math.floor(rect.height));
    canvas.width = Math.floor(w * this.dpr);
    canvas.height = Math.floor(h * this.dpr);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { w, h };
  }

  draw(state) {
    this.drawAntennaCanvas(state);
    this.drawFloorCanvas(state);
  }

  drawAntennaCanvas(state) {
    const { w, h } = this.resizeCanvas(this.antennaCanvas, this.antennaCtx);
    const ctx = this.antennaCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#151c2e';
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const y = h * 0.62;
    const spacing = Math.max(80, Math.min(180, w * 0.28));
    const a1x = centerX - spacing / 2;
    const a2x = centerX + spacing / 2;

    this.hitAntennas = [
      { id: 'A1', x: a1x, y, r: 16 },
      { id: 'A2', x: a2x, y, r: 16 }
    ];

    // 连线
    ctx.strokeStyle = '#5f7ab9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a1x, y);
    ctx.lineTo(a2x, y);
    ctx.stroke();

    // 天线体
    for (const ant of this.hitAntennas) {
      ctx.beginPath();
      ctx.arc(ant.x, ant.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#3a6ed8';
      ctx.fill();

      ctx.strokeStyle = '#8fb4ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ant.id, ant.x, ant.y);
    }

    ctx.fillStyle = '#7f9fd6';
    ctx.font = '12px Microsoft YaHei';
    ctx.textAlign = 'left';
    ctx.fillText('点击 A1/A2 配置经纬高；两天线高度参数共用', 10, 18);

    const offset = state.antennas.floorOffsetM;
    if (Number.isFinite(offset)) {
      ctx.fillStyle = '#4cdb9a';
      ctx.fillText(`当前天线离地高度: ${offset} m`, 10, h - 10);
    }
  }

  drawFloorCanvas(state) {
    const { w, h } = this.resizeCanvas(this.floorCanvas, this.floorCtx);
    const ctx = this.floorCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#10172a';
    ctx.fillRect(0, 0, w, h);

    const lengthM = state.floor.lengthM;
    const widthM = state.floor.widthM;

    // 根据画布大小计算比例
    const margin = 36;
    const maxW = Math.max(80, w - margin * 2);
    const maxH = Math.max(80, h - margin * 2);
    const pxPerMeter = Math.max(8, Math.min(maxW / Math.max(1, lengthM), maxH / Math.max(1, widthM)));
    const floorW = lengthM * pxPerMeter;
    const floorH = widthM * pxPerMeter;
    const fx = (w - floorW) / 2;
    const fy = (h - floorH) / 2;

    this.floorFrame = { x: fx, y: fy, w: floorW, h: floorH, pxPerMeter };

    // 地板
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx, fy, floorW, floorH);
    ctx.strokeStyle = '#8aa6de';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, floorW, floorH);

    // 穿刺点
    this.hitFloorPoints = [];
    for (const p of state.floor.points) {
      const x = fx + p.col * pxPerMeter;
      const y = fy + p.row * pxPerMeter;
      p.canvasXY = { x, y };

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2d8cff';
      ctx.fill();

      ctx.fillStyle = '#254070';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.id), x + 6, y);

      this.hitFloorPoints.push({ id: p.id, x, y, r: 6 });
    }

    // 仿真点
    this.hitSimPoints = [];
    for (const sp of state.simulation.points) {
      const fp = state.floor.points.find((p) => p.id === sp.floorPointId);
      if (!fp) continue;
      const x = fx + sp.localXM * pxPerMeter;
      const y = fy + sp.localYM * pxPerMeter;
      sp.canvasXY = { x, y };

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = state.simulation.mode === 'dual' ? '#6ddc6d' : '#ffbf3f';
      ctx.fill();

      this.hitSimPoints.push({
        simId: sp.simId,
        floorPointId: sp.floorPointId,
        x,
        y,
        r: 5,
        lla: sp.lla
      });
    }

    // 天线投影（红色实心三角形）
    if (state.antennas.configured) {
      const projs = this._antennaFloorProjections(state);
      for (const proj of projs) {
        const cx = fx + proj.localXM * pxPerMeter;
        const cy = fy + proj.localYM * pxPerMeter;
        const r = 9; // 外接圆半径
        const sin60 = Math.sqrt(3) / 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy - r);                     // 顶点
        ctx.lineTo(cx - r * sin60, cy + r * 0.5);  // 左下
        ctx.lineTo(cx + r * sin60, cy + r * 0.5);  // 右下
        ctx.closePath();
        ctx.fillStyle = '#e83535';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(proj.label, cx, cy + 1);
      }
    }

    // 文本
    ctx.fillStyle = '#8fb0e6';
    ctx.font = '12px Microsoft YaHei';
    ctx.textAlign = 'left';
    ctx.fillText(`地板尺寸: ${lengthM}m × ${widthM}m`, 8, 18);
    ctx.fillText(`穿刺点数: ${state.floor.points.length}`, 8, 34);
    if (state.simulation.points.length > 0) {
      ctx.fillText(`仿真点数: ${state.simulation.points.length}`, 8, 50);
    }
  }

  /**
   * 右键设置地板后，按 1m 网格重建穿刺点（编号左到右、上到下）
   */
  rebuildGridPoints(lengthM, widthM) {
    const points = [];
    let id = 1;
    for (let row = 0; row <= widthM; row++) {
      for (let col = 0; col <= lengthM; col++) {
        points.push({
          id,
          row,
          col,
          localXM: col,
          localYM: row,
          lla: { lon: null, lat: null, h: null },
          canvasXY: { x: 0, y: 0 }
        });
        id += 1;
      }
    }
    return points;
  }

  /**
   * 根据两天线配置推算地板穿刺点经纬高
   * 几何定义：
   * - 地板中心位于天线中点正下方 floorOffsetM
   * - 地板 X 轴沿 A1->A2，Y 轴为其水平正交
   */
  rebuildFloorPointsWithLla(state) {
    const a1 = state.antennas.list[0];
    const a2 = state.antennas.list[1];
    const offset = state.antennas.floorOffsetM;
    if (![a1.lonDeg, a1.latDeg, a1.hMeters, a2.lonDeg, a2.latDeg, a2.hMeters, offset].every(Number.isFinite)) {
      return state.floor.points;
    }

    const a1Ecef = llaToEcef({ lonDeg: a1.lonDeg, latDeg: a1.latDeg, hMeters: a1.hMeters });
    const a2Ecef = llaToEcef({ lonDeg: a2.lonDeg, latDeg: a2.latDeg, hMeters: a2.hMeters });

    const midEcef = {
      x: (a1Ecef.x + a2Ecef.x) / 2,
      y: (a1Ecef.y + a2Ecef.y) / 2,
      z: (a1Ecef.z + a2Ecef.z) / 2
    };
    const midLla = ecefToLla(midEcef);

    const floorCenterLla = {
      lonDeg: midLla.lonDeg,
      latDeg: midLla.latDeg,
      hMeters: midLla.hMeters - offset
    };

    const a1Enu = ecefToEnu(a1Ecef, floorCenterLla);
    const a2Enu = ecefToEnu(a2Ecef, floorCenterLla);

    let vx = a2Enu.e - a1Enu.e;
    let vy = a2Enu.n - a1Enu.n;
    const norm = Math.hypot(vx, vy) || 1;
    vx /= norm;
    vy /= norm;
    // 水平正交轴
    const wx = -vy;
    const wy = vx;

    const lengthM = state.floor.lengthM;
    const widthM = state.floor.widthM;

    for (const p of state.floor.points) {
      const xLocal = p.col - lengthM / 2;
      const yLocal = widthM / 2 - p.row;

      const e = xLocal * vx + yLocal * wx;
      const n = xLocal * vy + yLocal * wy;
      const u = 0;

      const pEcef = enuToEcef({ e, n, u }, floorCenterLla);
      const pLla = ecefToLla(pEcef);

      p.lla = {
        lon: pLla.lonDeg,
        lat: pLla.latDeg,
        h: pLla.hMeters
      };
    }

    return state.floor.points;
  }

  /**
   * 计算两根天线在地板平面的投影局部坐标
   */
  _antennaFloorProjections(state) {
    const a1 = state.antennas.list[0];
    const a2 = state.antennas.list[1];
    const offset = state.antennas.floorOffsetM;
    if (![a1.lonDeg, a1.latDeg, a1.hMeters, a2.lonDeg, a2.latDeg, a2.hMeters, offset].every(Number.isFinite)) {
      return [];
    }

    const a1Ecef = llaToEcef({ lonDeg: a1.lonDeg, latDeg: a1.latDeg, hMeters: a1.hMeters });
    const a2Ecef = llaToEcef({ lonDeg: a2.lonDeg, latDeg: a2.latDeg, hMeters: a2.hMeters });
    const midEcef = {
      x: (a1Ecef.x + a2Ecef.x) / 2,
      y: (a1Ecef.y + a2Ecef.y) / 2,
      z: (a1Ecef.z + a2Ecef.z) / 2
    };
    const midLla = ecefToLla(midEcef);
    const floorCenterLla = {
      lonDeg: midLla.lonDeg,
      latDeg: midLla.latDeg,
      hMeters: midLla.hMeters - offset
    };

    const a1Enu = ecefToEnu(a1Ecef, floorCenterLla);
    const a2Enu = ecefToEnu(a2Ecef, floorCenterLla);
    let vx = a2Enu.e - a1Enu.e;
    let vy = a2Enu.n - a1Enu.n;
    const norm = Math.hypot(vx, vy) || 1;
    vx /= norm; vy /= norm;
    const wx = -vy;
    const wy = vx;

    const lengthM = state.floor.lengthM;
    const widthM = state.floor.widthM;

    return [
      { ecef: a1Ecef, label: '1' },
      { ecef: a2Ecef, label: '2' },
    ].map(({ ecef, label }) => {
      const enu = ecefToEnu(ecef, floorCenterLla);
      // 投影到地板水平面（u=0）
      const xLocal = enu.e * vx + enu.n * vy;
      const yLocal = enu.e * wx + enu.n * wy;
      return {
        localXM: xLocal + lengthM / 2,
        localYM: widthM / 2 - yLocal,
        label,
      };
    });
  }

  hitTestFloorPoint(cssX, cssY) {
    for (let i = this.hitFloorPoints.length - 1; i >= 0; i--) {
      const p = this.hitFloorPoints[i];
      const dx = cssX - p.x;
      const dy = cssY - p.y;
      if (dx * dx + dy * dy <= p.r * p.r) {
        return p;
      }
    }
    return null;
  }

  hitTestSimPoint(cssX, cssY) {
    for (let i = this.hitSimPoints.length - 1; i >= 0; i--) {
      const p = this.hitSimPoints[i];
      const dx = cssX - p.x;
      const dy = cssY - p.y;
      if (dx * dx + dy * dy <= p.r * p.r) {
        return p;
      }
    }
    return null;
  }

  hitTestAntenna(cssX, cssY) {
    for (let i = this.hitAntennas.length - 1; i >= 0; i--) {
      const a = this.hitAntennas[i];
      const dx = cssX - a.x;
      const dy = cssY - a.y;
      if (dx * dx + dy * dy <= a.r * a.r) {
        return a.id;
      }
    }
    return null;
  }

  /**
   * 生成仿真点时，限制在穿刺点 1m 半径
   */
  clampOffsetToRadius(dx, dy, radius = 1) {
    const r = Math.hypot(dx, dy);
    if (r <= radius || r === 0) return { dx, dy };
    const k = radius / r;
    return { dx: dx * k, dy: dy * k };
  }
}
