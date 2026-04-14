import { enuToEcef, ecefToLla } from '../modules/coordinates.js';

/**
 * 默认仿真策略：在穿刺点周围 1m 范围随机生成
 */
export const random1mStrategy = {
  name: 'random-1m',

  /**
   * @param {Object} params
   * @param {Array} params.floorPoints
   * @param {'single'|'dual'} params.mode
   * @param {Object} params.floorCenterLla  地板中心点 LLA
   * @param {number} params.lengthM
   * @param {number} params.widthM
   * @returns {Array}
   */
  run({ floorPoints, mode, floorCenterLla, lengthM, widthM }) {
    const simPoints = [];
    let id = 1;
    const countPerPoint = mode === 'dual' ? 2 : 1;

    for (const fp of floorPoints) {
      for (let i = 0; i < countPerPoint; i++) {
        // 极坐标均匀随机：r in [0,1], theta in [0,2π)
        const theta = Math.random() * 2 * Math.PI;
        const r = Math.sqrt(Math.random()) * 1.0;
        const dx = r * Math.cos(theta);
        const dy = r * Math.sin(theta);

        const localXM = fp.localXM + dx;
        const localYM = fp.localYM + dy;

        // 网格坐标 -> 以地板中心为原点的 ENU
        const xLocal = localXM - lengthM / 2;
        const yLocal = widthM / 2 - localYM;

        const pointEcef = enuToEcef({ e: xLocal, n: yLocal, u: 0 }, floorCenterLla);
        const pointLla = ecefToLla(pointEcef);

        simPoints.push({
          simId: `S${id}`,
          floorPointId: fp.id,
          localXM,
          localYM,
          lla: {
            lon: pointLla.lonDeg,
            lat: pointLla.latDeg,
            h: pointLla.hMeters
          }
        });

        id += 1;
      }
    }

    return simPoints;
  }
};
