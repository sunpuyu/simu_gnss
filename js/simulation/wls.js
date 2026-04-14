/**
 * 加权最小二乘仿真算法
 *
 * 观测值：卫星 → 天线 → 穿刺点 的折线距离（已知量，代替伪距）
 * 未知量（单天线 / 单系统双天线）：[x, y, z, c·dt]          — 4 参数
 * 未知量（GPS+BDS 双天线）：[x, y, z, c·dt_GPS, c·ISB_BDS]  — 5 参数
 *   其中 ISB_BDS = c·(dt_BDS - dt_GPS) 为系统间偏差
 *
 * 双天线权重：基础指数模型 w = 10^(SNR/10)，SNR = 45 - d（d 为穿刺点到天线距离 m）
 *             SNR < 20（d > 25m）时剔除观测
 * 单天线权重：等权 w = 1
 */

import { llaToEcef, ecefToLla, ecefToEnu } from '../modules/coordinates.js';

// ── 基础工具 ─────────────────────────────────────────────────

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 带部分主元的 n×n 增广矩阵高斯消元
 * 解 A·δ = b，返回 δ 或 null（奇异时）
 */
function gaussElim(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) return null;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col] / pivot;
      for (let k = col; k <= n; k++) aug[row][k] -= f * aug[col][k];
    }
  }
  return aug.map((row, i) => row[n] / row[i]);
}

/**
 * 加权最小二乘正规方程求解
 *   法方程：(H^T W H) δ = H^T W l
 * @param {number[][]} H  n×m 设计矩阵
 * @param {number[]}   l  n 残差向量
 * @param {number[]}   W  n 对角权重
 * @param {number}     m  未知数个数（4 或 5）
 * @returns {number[]|null} m 维解向量
 */
function wls(H, l, W, m) {
  const AtWA = Array.from({ length: m }, () => new Array(m).fill(0.0));
  const AtWl = new Array(m).fill(0.0);
  for (let i = 0; i < H.length; i++) {
    const wi = W[i];
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) AtWA[r][c] += wi * H[i][r] * H[i][c];
      AtWl[r] += wi * H[i][r] * l[i];
    }
  }
  return gaussElim(AtWA, AtWl);
}

// ── WLS 迭代解算 ─────────────────────────────────────────────

/**
 * 迭代加权最小二乘
 *
 * 单系统（useIsb=false）：未知量 [x, y, z, c·dt]
 *   设计矩阵行：[(x-xs)/r, (y-ys)/r, (z-zs)/r, 1]
 *
 * 双系统（useIsb=true）：未知量 [x, y, z, c·dt_GPS, c·ISB_BDS]
 *   GPS 行：[(x-xs)/r, (y-ys)/r, (z-zs)/r, 1, 0]
 *   BDS 行：[(x-xs)/r, (y-ys)/r, (z-zs)/r, 1, 1]
 *   等价于：ρ_GPS = r + c·dt_GPS
 *           ρ_BDS = r + c·dt_GPS + c·ISB_BDS
 *
 * @param {{x,y,z}} approxEcef  初始值（穿刺点 ECEF）
 * @param {{satEcef, rho, w, system}[]} obs  观测值（system: 'G'|'C'）
 * @param {boolean} useIsb  是否估计系统间偏差（双系统时为 true）
 * @returns {{ecef:{x,y,z}, cdt:number, cisb:number}|null}
 */
function solveWLS(approxEcef, obs, useIsb) {
  const m = useIsb ? 5 : 4;
  let x = approxEcef.x;
  let y = approxEcef.y;
  let z = approxEcef.z;
  let cdt = 0.0;  // GPS 接收机钟差（×c）
  let cisb = 0.0; // BDS 系统间偏差（×c），单系统时不使用

  for (let iter = 0; iter < 20; iter++) {
    const H = [];
    const l = [];
    const W = [];

    for (const ob of obs) {
      const dx = x - ob.satEcef.x;
      const dy = y - ob.satEcef.y;
      const dz = z - ob.satEcef.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < 1.0) continue;

      const isBds = ob.system === 'C';
      // 当前迭代的计算量（含钟差 / ISB）
      const computedRange = r + cdt + (useIsb && isBds ? cisb : 0.0);

      if (useIsb) {
        // 5 参数：[δx, δy, δz, δ(c·dt_GPS), δ(c·ISB_BDS)]
        H.push([dx / r, dy / r, dz / r, 1.0, isBds ? 1.0 : 0.0]);
      } else {
        // 4 参数：[δx, δy, δz, δ(c·dt)]
        H.push([dx / r, dy / r, dz / r, 1.0]);
      }
      l.push(ob.rho - computedRange);
      W.push(ob.w);
    }

    if (H.length < m) return null;

    const delta = wls(H, l, W, m);
    if (!delta) return null;

    x += delta[0];
    y += delta[1];
    z += delta[2];
    cdt += delta[3];
    if (useIsb) cisb += delta[4];

    if (Math.sqrt(delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2) < 1e-6) break;
  }

  return { ecef: { x, y, z }, cdt, cisb };
}

// ── 坐标转换辅助 ─────────────────────────────────────────────

/**
 * 将解算出的 ECEF 坐标转换回地板局部网格坐标 (localXM, localYM)
 * 坐标轴定义与 floor-renderer.js rebuildFloorPointsWithLla 保持一致
 */
function ecefToLocalXY(solvedEcef, floorCenterLla, vx, vy, wx, wy, lengthM, widthM) {
  const enu = ecefToEnu(solvedEcef, floorCenterLla);
  const xLocal = enu.e * vx + enu.n * vy;
  const yLocal = enu.e * wx + enu.n * wy;
  return {
    localXM: xLocal + lengthM / 2,
    localYM: widthM / 2 - yLocal,
  };
}

// ── 策略主体 ─────────────────────────────────────────────────

export const wlsStrategy = {
  name: 'wls',

  /**
   * @param {object} params
   * @param {Array}  params.floorPoints     穿刺点列表
   * @param {'single'|'dual'} params.mode
   * @param {object} params.floorCenterLla  地板中心 {lonDeg,latDeg,hMeters}
   * @param {number} params.lengthM
   * @param {number} params.widthM
   * @param {Array}  params.satellites      可见卫星 [{satId,system,ecef,...}]
   * @param {Array}  params.antennas        天线列表 [{id,lonDeg,latDeg,hMeters}]
   * @param {Map}    params.bindings        satId → 'A1'|'A2'|'NONE'
   * @returns {Array} 仿真点列表
   */
  run({ floorPoints, mode, floorCenterLla, lengthM, widthM, satellites, antennas, bindings }) {
    const a1 = antennas[0];
    const a2 = antennas[1];
    const a1Ecef = llaToEcef({ lonDeg: a1.lonDeg, latDeg: a1.latDeg, hMeters: a1.hMeters });
    const a2Ecef = llaToEcef({ lonDeg: a2.lonDeg, latDeg: a2.latDeg, hMeters: a2.hMeters });
    const antEcef = { A1: a1Ecef, A2: a2Ecef };

    // 地板坐标系轴向（与 floor-renderer.js 保持一致）
    const a1Enu = ecefToEnu(a1Ecef, floorCenterLla);
    const a2Enu = ecefToEnu(a2Ecef, floorCenterLla);
    let vx = a2Enu.e - a1Enu.e;
    let vy = a2Enu.n - a1Enu.n;
    const axisNorm = Math.hypot(vx, vy) || 1;
    vx /= axisNorm;
    vy /= axisNorm;
    const wx = -vy;
    const wy = vx;

    const simPoints = [];
    let id = 1;

    for (const fp of floorPoints) {
      if (!fp.lla || !Number.isFinite(fp.lla.lon)) continue;

      const fpEcef = llaToEcef({ lonDeg: fp.lla.lon, latDeg: fp.lla.lat, hMeters: fp.lla.h });
      const obs = [];

      if (mode === 'single') {
        // ── 单天线：选最近天线，等权，4 参数解算 ──
        const d1 = dist3(fpEcef, a1Ecef);
        const d2 = dist3(fpEcef, a2Ecef);
        const chosenAnt = d1 < d2 ? 'A1' : d2 < d1 ? 'A2' : (Math.random() < 0.5 ? 'A1' : 'A2');

        for (const sat of satellites) {
          if ((bindings.get(sat.satId) ?? 'NONE') !== chosenAnt) continue;
          const rho = dist3(sat.ecef, antEcef[chosenAnt]) + dist3(antEcef[chosenAnt], fpEcef);
          obs.push({ satEcef: sat.ecef, rho, w: 1.0, system: sat.system });
        }

        if (obs.length < 4) continue;
        const result = solveWLS(fpEcef, obs, false);
        if (!result) continue;

        const solvedLla = ecefToLla(result.ecef);
        const { localXM, localYM } = ecefToLocalXY(
          result.ecef, floorCenterLla, vx, vy, wx, wy, lengthM, widthM
        );
        simPoints.push({
          simId: `S${id}`, floorPointId: fp.id, localXM, localYM,
          lla: { lon: solvedLla.lonDeg, lat: solvedLla.latDeg, h: solvedLla.hMeters },
        });
        id += 1;

      } else {
        // ── 双天线：合并两天线观测，SNR 定权 ──
        for (const sat of satellites) {
          const binding = bindings.get(sat.satId) ?? 'NONE';
          if (binding !== 'A1' && binding !== 'A2') continue;
          const dAntPierce = dist3(antEcef[binding], fpEcef);
          const snr = 45.0 - dAntPierce;
          if (snr < 20.0) continue;
          const rho = dist3(sat.ecef, antEcef[binding]) + dAntPierce;
          const w = Math.pow(10.0, snr / 10.0);
          obs.push({ satEcef: sat.ecef, rho, w, system: sat.system });
        }

        // 判断是否存在 GPS + BDS 双系统观测
        const hasGps = obs.some(o => o.system === 'G');
        const hasBds = obs.some(o => o.system === 'C');
        // 双系统时估计 ISB（5 参数），单系统时退化为 4 参数
        const useIsb = hasGps && hasBds;
        const minObs = useIsb ? 5 : 4;

        if (obs.length < minObs) continue;
        const result = solveWLS(fpEcef, obs, useIsb);
        if (!result) continue;

        const solvedLla = ecefToLla(result.ecef);
        const { localXM, localYM } = ecefToLocalXY(
          result.ecef, floorCenterLla, vx, vy, wx, wy, lengthM, widthM
        );
        simPoints.push({
          simId: `S${id}`, floorPointId: fp.id, localXM, localYM,
          lla: { lon: solvedLla.lonDeg, lat: solvedLla.latDeg, h: solvedLla.hMeters },
        });
        id += 1;
      }
    }

    return simPoints;
  },
};
