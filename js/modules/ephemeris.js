/**
 * RINEX 3.04 NAV 解析模块（GPS/BDS）
 */

export function parseRinex304(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (!lines.length) {
    throw new Error('星历文件为空');
  }

  const versionLine = lines[0] || '';
  const version = parseFloat(versionLine.slice(0, 9).trim());
  if (Number.isNaN(version) || version < 3) {
    throw new Error('仅支持 RINEX 3.x NAV 文件');
  }

  let i = 0;
  while (i < lines.length && !lines[i].includes('END OF HEADER')) {
    i += 1;
  }
  if (i >= lines.length) {
    throw new Error('未找到 RINEX 头结束标记 END OF HEADER');
  }

  i += 1;
  const recordsBySat = new Map();
  const systems = { G: false, C: false };
  let startTimeSec = Infinity;
  let endTimeSec = -Infinity;

  while (i < lines.length) {
    const line0 = lines[i];
    if (!line0 || line0.trim().length < 3) {
      i += 1;
      continue;
    }

    const satId = line0.slice(0, 3).trim();
    if (!/^[A-Z]\d{2}$/.test(satId)) {
      i += 1;
      continue;
    }

    const system = satId[0];
    const lineCount = getRecordLineCount(system);

    if (system !== 'G' && system !== 'C') {
      i += lineCount;
      continue;
    }

    systems[system] = true;

    const block = lines.slice(i, i + lineCount);
    if (block.length < lineCount) {
      break;
    }

    const epoch = parseEpochFromLine(block[0]);
    const tocSec = epochToUtcSec(epoch);

    const nums = [];
    for (let r = 0; r < lineCount; r++) {
      const row = block[r] || '';
      const startCol = r === 0 ? 23 : 4;
      for (let c = startCol; c < row.length; c += 19) {
        const chunk = row.slice(c, c + 19);
        if (!chunk.trim()) continue;
        const v = parseFloat(chunk.replace(/D/g, 'E'));
        nums.push(Number.isNaN(v) ? 0 : v);
      }
    }

    const record = {
      satId,
      system,
      prn: parseInt(satId.slice(1), 10),
      tocSec,
      af0: nums[0] ?? 0,
      af1: nums[1] ?? 0,
      af2: nums[2] ?? 0,
      IODE: nums[3] ?? 0,
      Crs: nums[4] ?? 0,
      deltaN: nums[5] ?? 0,
      M0: nums[6] ?? 0,
      Cuc: nums[7] ?? 0,
      e: nums[8] ?? 0,
      Cus: nums[9] ?? 0,
      sqrtA: nums[10] ?? 0,
      toeSec: nums[11] ?? 0,
      Cic: nums[12] ?? 0,
      Omega0: nums[13] ?? 0,
      Cis: nums[14] ?? 0,
      i0: nums[15] ?? 0,
      Crc: nums[16] ?? 0,
      omega: nums[17] ?? 0,
      OmegaDot: nums[18] ?? 0,
      IDOT: nums[19] ?? 0,
      raw: block
    };

    if (!recordsBySat.has(satId)) {
      recordsBySat.set(satId, []);
    }
    recordsBySat.get(satId).push(record);

    startTimeSec = Math.min(startTimeSec, tocSec);
    endTimeSec = Math.max(endTimeSec, tocSec);

    i += lineCount;
  }

  for (const [satId, list] of recordsBySat.entries()) {
    list.sort((a, b) => a.tocSec - b.tocSec);
    recordsBySat.set(satId, list);
  }

  if (!recordsBySat.size) {
    throw new Error('未解析到 GPS/BDS 星历记录');
  }

  return {
    startTimeSec,
    endTimeSec,
    startText: formatUtc(startTimeSec),
    endText: formatUtc(endTimeSec),
    recordsBySat,
    systems
  };
}

/**
 * 在星历序列中取距离目标时刻最近的一条
 */
export function pickNearestRecord(records, targetSec) {
  if (!records || !records.length) return null;
  let best = records[0];
  let minDiff = Math.abs(targetSec - best.tocSec);
  for (let i = 1; i < records.length; i++) {
    const diff = Math.abs(targetSec - records[i].tocSec);
    if (diff < minDiff) {
      minDiff = diff;
      best = records[i];
    }
  }
  return best;
}

/**
 * 严格解析 YYYY-MM-DD HH:MM:SS（UTC）
 */
export function parseTimeText(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec((text || '').trim());
  if (!m) {
    throw new Error('时间格式应为 YYYY-MM-DD HH:MM:SS');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) {
    throw new Error('时间字段范围非法');
  }
  return Math.floor(Date.UTC(y, mo - 1, d, hh, mm, ss) / 1000);
}

export function formatUtc(sec) {
  const dt = new Date(sec * 1000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  const ss = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * RINEX 3 各系统每条记录的行数
 *  G/C/E/J/I : 8 行（1 epoch + 7 orbit）
 *  R/S       : 4 行（1 epoch + 3 orbit）
 */
function getRecordLineCount(system) {
  return (system === 'R' || system === 'S') ? 4 : 8;
}

function parseEpochFromLine(line) {
  const year = parseInt(line.slice(4, 8).trim(), 10);
  const month = parseInt(line.slice(9, 11).trim(), 10);
  const day = parseInt(line.slice(12, 14).trim(), 10);
  const hour = parseInt(line.slice(15, 17).trim(), 10);
  const minute = parseInt(line.slice(18, 20).trim(), 10);
  const second = parseFloat(line.slice(21, 23).trim());
  return { year, month, day, hour, minute, second };
}

function epochToUtcSec({ year, month, day, hour, minute, second }) {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second)) / 1000);
}
