/**
 * WGS84 坐标变换工具
 * LLA <-> ECEF <-> ENU
 */

const WGS84_A = 6378137.0;         // 长半轴 (m)
const WGS84_F = 1 / 298.257223563; // 扁率
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F; // 第一偏心率平方

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * 大地坐标 (LLA) → 地心地固坐标 (ECEF)
 * @param {{lonDeg:number, latDeg:number, hMeters:number}} lla
 * @returns {{x:number, y:number, z:number}}
 */
export function llaToEcef({ lonDeg, latDeg, hMeters }) {
  const lon = lonDeg * DEG2RAD;
  const lat = latDeg * DEG2RAD;
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2);
  const x = (N + hMeters) * Math.cos(lat) * Math.cos(lon);
  const y = (N + hMeters) * Math.cos(lat) * Math.sin(lon);
  const z = (N * (1 - WGS84_E2) + hMeters) * Math.sin(lat);
  return { x, y, z };
}

/**
 * ECEF → LLA（迭代法）
 * @param {{x:number, y:number, z:number}} ecef
 * @returns {{lonDeg:number, latDeg:number, hMeters:number}}
 */
export function ecefToLla({ x, y, z }) {
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
  }
  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const h = p / Math.cos(lat) - N;
  return { lonDeg: lon * RAD2DEG, latDeg: lat * RAD2DEG, hMeters: h };
}

/**
 * ECEF → ENU（以 originLla 为原点）
 * @param {{x:number,y:number,z:number}} pointEcef 目标点
 * @param {{lonDeg:number,latDeg:number,hMeters:number}} originLla 参考点
 * @returns {{e:number, n:number, u:number}}
 */
export function ecefToEnu(pointEcef, originLla) {
  const originEcef = llaToEcef(originLla);
  const dx = pointEcef.x - originEcef.x;
  const dy = pointEcef.y - originEcef.y;
  const dz = pointEcef.z - originEcef.z;

  const lon = originLla.lonDeg * DEG2RAD;
  const lat = originLla.latDeg * DEG2RAD;
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);

  const e = -sinLon * dx + cosLon * dy;
  const n = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const u = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;
  return { e, n, u };
}

/**
 * ENU → ECEF（以 originLla 为原点）
 * @param {{e:number,n:number,u:number}} enu
 * @param {{lonDeg:number,latDeg:number,hMeters:number}} originLla
 * @returns {{x:number,y:number,z:number}}
 */
export function enuToEcef({ e, n, u }, originLla) {
  const originEcef = llaToEcef(originLla);
  const lon = originLla.lonDeg * DEG2RAD;
  const lat = originLla.latDeg * DEG2RAD;
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);

  const dx = -sinLon * e - sinLat * cosLon * n + cosLat * cosLon * u;
  const dy = cosLon * e - sinLat * sinLon * n + cosLat * sinLon * u;
  const dz = cosLat * n + sinLat * u;
  return { x: originEcef.x + dx, y: originEcef.y + dy, z: originEcef.z + dz };
}
