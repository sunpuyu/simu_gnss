/**
 * 卫星位置计算（开普勒轨道）+ 高度角/方位角
 */
import { llaToEcef, ecefToEnu } from './coordinates.js';
import { pickNearestRecord } from './ephemeris.js';

// GPS 常量
const GPS_MU = 3.986005e14;
const GPS_WE = 7.2921151467e-5;

// BDS 常量
const BDS_MU = 3.986004418e14;
const BDS_WE = 7.2921150e-5;

const DEG2RAD = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

/**
 * 计算单颗卫星的 ECEF 坐标
 * @param {Object} record  广播星历记录
 * @param {number} targetSec  目标时刻 UTC 秒
 * @param {string} system  'G'|'C'
 * @returns {{x:number,y:number,z:number}}
 */
export function computeSatEcef(record, targetSec, system) {
  const MU = system === 'C' ? BDS_MU : GPS_MU;
  const WE = system === 'C' ? BDS_WE : GPS_WE;

  const A = record.sqrtA * record.sqrtA;
  // toeSec 为周内秒（SOW），targetSec/tocSec 为绝对 UTC 秒
  // 先以 toc 为锚点，把 target 投影到同一周内计算 tk
  const tocSow = ((record.tocSec % 604800) + 604800) % 604800;
  let tk = (targetSec - record.tocSec) + (tocSow - record.toeSec);

  const n0 = Math.sqrt(MU / (A * A * A));
  const n = n0 + record.deltaN;
  const Mk = record.M0 + n * tk;

  // 迭代求偏近点角
  let Ek = Mk;
  for (let iter = 0; iter < 15; iter++) {
    const dE = (Mk - Ek + record.e * Math.sin(Ek)) / (1 - record.e * Math.cos(Ek));
    Ek += dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  // 真近点角
  const sinEk = Math.sin(Ek);
  const cosEk = Math.cos(Ek);
  const sqrtEcc = Math.sqrt(1 - record.e * record.e);
  const vk = Math.atan2(sqrtEcc * sinEk, cosEk - record.e);
  const phik = vk + record.omega;

  // 摄动改正
  const sin2phi = Math.sin(2 * phik);
  const cos2phi = Math.cos(2 * phik);
  const du = record.Cus * sin2phi + record.Cuc * cos2phi;
  const dr = record.Crs * sin2phi + record.Crc * cos2phi;
  const di = record.Cis * sin2phi + record.Cic * cos2phi;

  const uk = phik + du;
  const rk = A * (1 - record.e * cosEk) + dr;
  const ik = record.i0 + di + record.IDOT * tk;

  // 轨道面坐标
  const xp = rk * Math.cos(uk);
  const yp = rk * Math.sin(uk);

  // 升交点赤经
  let Omegak = record.Omega0 + (record.OmegaDot - WE) * tk - WE * record.toeSec;
  Omegak = Omegak % TWO_PI;

  const cosOmega = Math.cos(Omegak);
  const sinOmega = Math.sin(Omegak);
  const cosI = Math.cos(ik);
  const sinI = Math.sin(ik);

  let x = xp * cosOmega - yp * cosI * sinOmega;
  let y = xp * sinOmega + yp * cosI * cosOmega;
  let z = yp * sinI;

  // BDS GEO 卫星额外修正（PRN 1-5 为 GEO）
  if (system === 'C' && record.prn >= 1 && record.prn <= 5) {
    const theta = WE * tk;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const tiltAngle = -5 * DEG2RAD;
    const cosT5 = Math.cos(tiltAngle);
    const sinT5 = Math.sin(tiltAngle);

    // GEO: 先绕 Z 轴旋转 -OmegaDot*toeSec，再绕 X 轴倾转 -5°，再绕 Z 轴转 WE*tk
    const x1 = x * cosT + y * sinT;
    const y1 = -x * sinT + y * cosT;
    const z1 = z;

    const x2 = x1;
    const y2 = y1 * cosT5 - z1 * sinT5;
    const z2 = y1 * sinT5 + z1 * cosT5;

    x = x2; y = y2; z = z2;
  }

  return { x, y, z };
}

/**
 * 计算高度角与方位角
 * @param {{x:number,y:number,z:number}} satEcef
 * @param {{lonDeg:number,latDeg:number,hMeters:number}} refLla
 * @returns {{elDeg:number, azDeg:number}}
 */
export function computeAzEl(satEcef, refLla) {
  const enu = ecefToEnu(satEcef, refLla);
  const { e, n, u } = enu;
  const elDeg = Math.atan2(u, Math.sqrt(e * e + n * n)) * (180 / Math.PI);
  let azDeg = Math.atan2(e, n) * (180 / Math.PI);
  if (azDeg < 0) azDeg += 360;
  return { elDeg, azDeg };
}

/**
 * 批量计算所有可见卫星
 * @param {Map} recordsBySat  satId -> EphemerisRecord[]
 * @param {{lonDeg,latDeg,hMeters}} refLla
 * @param {number} targetSec
 * @returns {Array}
 */
export function computeAllVisible(recordsBySat, refLla, targetSec) {
  const results = [];
  for (const [satId, records] of recordsBySat.entries()) {
    const system = satId[0];
    const record = pickNearestRecord(records, targetSec);
    if (!record) continue;
    let ecef;
    try {
      ecef = computeSatEcef(record, targetSec, system);
    } catch {
      continue;
    }
    const { elDeg, azDeg } = computeAzEl(ecef, refLla);
    results.push({
      satId,
      system,
      prn: record.prn,
      ecef,
      elDeg,
      azDeg,
      visible: elDeg > 0
    });
  }
  return results;
}
