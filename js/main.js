import { state, resetSimulation } from './state.js';
import { parseRinex304, parseTimeText } from './modules/ephemeris.js';
import { computeAllVisible } from './modules/satellite.js';
import { llaToEcef, ecefToLla } from './modules/coordinates.js';
import { SkyRenderer } from './modules/sky-renderer.js';
import { FloorRenderer } from './modules/floor-renderer.js';
import { simulationEngine } from './simulation/engine.js';
import { showTooltip, hideTooltip } from './ui/tooltip.js';
import {
  openFloorConfig,
  openAntennaConfig,
  openSatBinding,
  openReadSuccessDialog
} from './ui/modal.js';

// ── DOM 引用 ──────────────────────────────────────────────────
const fileEphemeris = document.getElementById('fileEphemeris');
const txtStartTime = document.getElementById('txtStartTime');
const txtEndTime = document.getElementById('txtEndTime');
const inpRefLon = document.getElementById('inpRefLon');
const inpRefLat = document.getElementById('inpRefLat');
const inpRefH = document.getElementById('inpRefH');
const inpRefTime = document.getElementById('inpRefTime');
const btnConfirmCalc = document.getElementById('btnConfirmCalc');
const leftStatus = document.getElementById('leftStatus');

const btnBindSat = document.getElementById('btnBindSat');
const btnSingleSim = document.getElementById('btnSingleSim');
const btnDualSim = document.getElementById('btnDualSim');
const rightStatus = document.getElementById('rightStatus');

const skyCanvas = document.getElementById('skyCanvas');
const floorCanvas = document.getElementById('floorCanvas');
const antennaCanvas = document.getElementById('antennaCanvas');

// ── 渲染器 ────────────────────────────────────────────────────
const skyRenderer = new SkyRenderer(skyCanvas);
const floorRenderer = new FloorRenderer(floorCanvas, antennaCanvas);

// ── 辅助函数 ─────────────────────────────────────────────────

function setStatus(el, msg, type = 'info') {
  el.textContent = msg;
  el.className = 'status' + (type === 'ok' ? ' ok' : type === 'error' ? ' error' : '');
}

function redrawAll() {
  skyRenderer.draw(state);
  floorRenderer.draw(state);
}

function updateButtonStates() {
  btnConfirmCalc.disabled = !state.ephemeris.loaded || !validateReference(true);
  btnBindSat.disabled = !state.satellites.computed;
  const canSim = state.floor.configured && state.antennas.configured;
  btnSingleSim.disabled = !canSim;
  btnDualSim.disabled = !canSim;
}

function validateReference(silent = false) {
  const lon = parseFloat(inpRefLon.value);
  const lat = parseFloat(inpRefLat.value);
  const h = parseFloat(inpRefH.value);
  const timeText = inpRefTime.value.trim();

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    if (!silent) setStatus(leftStatus, '经度范围 -180 ~ 180', 'error');
    return false;
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    if (!silent) setStatus(leftStatus, '纬度范围 -90 ~ 90', 'error');
    return false;
  }
  if (!Number.isFinite(h)) {
    if (!silent) setStatus(leftStatus, '高程必须为有效数值', 'error');
    return false;
  }

  let refSec;
  try {
    refSec = parseTimeText(timeText);
  } catch (e) {
    if (!silent) setStatus(leftStatus, e.message, 'error');
    return false;
  }

  if (state.ephemeris.loaded) {
    if (refSec < state.ephemeris.startTimeSec || refSec > state.ephemeris.endTimeSec) {
      if (!silent) {
        setStatus(leftStatus,
          `参考时间须在 ${state.ephemeris.startText} ~ ${state.ephemeris.endText} 之间`,
          'error');
      }
      return false;
    }
  }

  state.reference.lonDeg = lon;
  state.reference.latDeg = lat;
  state.reference.hMeters = h;
  state.reference.refTimeText = timeText;
  state.reference.refTimeSec = refSec;
  state.reference.valid = true;
  return true;
}

// ── 导出 CSV ─────────────────────────────────────────────────

function exportCsv() {
  const pts = state.simulation.points;
  if (!pts.length) return;

  const BOM = '\uFEFF';
  const header = 'mode,floor_point_id,floor_lon,floor_lat,floor_h,sim_lon,sim_lat,sim_h,sim_id\n';
  const rows = pts.map((sp) => {
    const fp = state.floor.points.find((p) => p.id === sp.floorPointId) || {};
    const fla = fp.lla || {};
    return [
      state.simulation.mode,
      sp.floorPointId,
      (fla.lon ?? '').toString().slice(0, 12),
      (fla.lat ?? '').toString().slice(0, 12),
      (fla.h ?? '').toString().slice(0, 10),
      sp.lla.lon.toFixed(9),
      sp.lla.lat.toFixed(9),
      sp.lla.h.toFixed(4),
      sp.simId
    ].join(',');
  });

  const dt = new Date();
  const ts = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}_${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}${String(dt.getSeconds()).padStart(2, '0')}`;
  const filename = `sim_points_${ts}.csv`;

  const blob = new Blob([BOM + header + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 左侧事件 ─────────────────────────────────────────────────

fileEphemeris.addEventListener('change', async () => {
  const file = fileEphemeris.files[0];
  if (!file) return;
  setStatus(leftStatus, '读取中...', 'info');
  try {
    const text = await file.text();
    const result = parseRinex304(text);
    Object.assign(state.ephemeris, result, { loaded: true, fileName: file.name });

    setStatus(leftStatus,
      `已加载: ${file.name}（GPS: ${result.systems.G ? '✓' : '✗'} BDS: ${result.systems.C ? '✓' : '✗'}）`,
      'ok');

    openReadSuccessDialog(() => {
      txtStartTime.value = state.ephemeris.startText;
      txtEndTime.value = state.ephemeris.endText;
      updateButtonStates();
    });
  } catch (e) {
    setStatus(leftStatus, `解析失败: ${e.message}`, 'error');
    updateButtonStates();
  }
  fileEphemeris.value = '';
});

[inpRefLon, inpRefLat, inpRefH, inpRefTime].forEach((el) => {
  el.addEventListener('input', updateButtonStates);
});

btnConfirmCalc.addEventListener('click', () => {
  if (!validateReference(false)) return;
  setStatus(leftStatus, '计算中...', 'info');

  try {
    const all = computeAllVisible(
      state.ephemeris.recordsBySat,
      {
        lonDeg: state.reference.lonDeg,
        latDeg: state.reference.latDeg,
        hMeters: state.reference.hMeters
      },
      state.reference.refTimeSec
    );
    state.satellites.all = all;
    state.satellites.visible = all.filter((s) => s.visible);
    state.satellites.computed = true;
    setStatus(leftStatus,
      `计算完成：共 ${all.length} 颗卫星，可见 ${state.satellites.visible.length} 颗`,
      'ok');
  } catch (e) {
    setStatus(leftStatus, `计算失败: ${e.message}`, 'error');
  }

  updateButtonStates();
  redrawAll();
});

// ── 星空 hover ────────────────────────────────────────────────

skyCanvas.addEventListener('mousemove', (e) => {
  const rect = skyCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = skyRenderer.hitTest(x, y);
  if (hit) {
    const sysLabel = hit.satId[0] === 'C' ? 'BDS' : 'GPS';
    showTooltip(`${hit.satId} (${sysLabel})\n高度角: ${hit.elDeg.toFixed(1)}°`, e.pageX, e.pageY);
  } else {
    hideTooltip();
  }
});

skyCanvas.addEventListener('mouseleave', hideTooltip);

// ── 右侧按钮 ──────────────────────────────────────────────────

btnBindSat.addEventListener('click', () => {
  openSatBinding(state, (bindings) => {
    state.binding.satToAntenna = bindings;
    setStatus(rightStatus, `已保存 ${bindings.size} 条卫星绑定`, 'ok');
  });
});

btnSingleSim.addEventListener('click', () => runSimulation('single'));
btnDualSim.addEventListener('click', () => runSimulation('dual'));

function runSimulation(mode) {
  if (!state.floor.configured || !state.antennas.configured) {
    setStatus(rightStatus, '请先配置地板尺寸与天线参数', 'error');
    return;
  }

  resetSimulation();
  state.simulation.mode = mode;

  const a1 = state.antennas.list[0];
  const a2 = state.antennas.list[1];
  const offset = state.antennas.floorOffsetM;

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

  try {
    const pts = simulationEngine.run(mode, {
      floorPoints: state.floor.points,
      floorCenterLla,
      lengthM: state.floor.lengthM,
      widthM: state.floor.widthM,
      satellites: state.satellites.visible,
      antennas: state.antennas.list,
      bindings: state.binding.satToAntenna,
    });
    state.simulation.points = pts;
    state.simulation.lastRunTime = Date.now();
    setStatus(rightStatus, `[${mode === 'single' ? '单天线' : '双天线'}] 生成仿真点 ${pts.length} 个，正在导出...`, 'ok');

    redrawAll();
    setTimeout(exportCsv, 300);
  } catch (e) {
    setStatus(rightStatus, `仿真失败: ${e.message}`, 'error');
  }

  updateButtonStates();
  updateSimButtonStyles(mode);
}

function updateSimButtonStyles(mode) {
  btnSingleSim.classList.toggle('active-mode', mode === 'single');
  btnDualSim.classList.toggle('active-mode', mode === 'dual');
}

// ── 地板点击 ──────────────────────────────────────────────────

floorCanvas.addEventListener('click', () => {
  openFloorConfig(state.floor, ({ lengthM, widthM }) => {
    state.floor.lengthM = lengthM;
    state.floor.widthM = widthM;
    state.floor.points = floorRenderer.rebuildGridPoints(lengthM, widthM);

    if (state.antennas.configured) {
      floorRenderer.rebuildFloorPointsWithLla(state);
    }

    state.floor.configured = true;
    resetSimulation();
    updateSimButtonStyles('none');
    updateButtonStates();
    redrawAll();
    setStatus(rightStatus, `地板已设为 ${lengthM}m × ${widthM}m，共 ${state.floor.points.length} 个穿刺点`, 'ok');
  });
});

// ── 天线点击 ─────────────────────────────────────────────────

antennaCanvas.addEventListener('click', (e) => {
  const rect = antennaCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const antId = floorRenderer.hitTestAntenna(x, y);
  if (!antId) return;

  openAntennaConfig(antId, state, ({ antennaId, lon, lat, h, off }) => {
    const ant = state.antennas.list.find((a) => a.id === antennaId);
    if (ant) {
      ant.lonDeg = lon;
      ant.latDeg = lat;
      ant.hMeters = h;
    }
    state.antennas.floorOffsetM = off;

    const both = state.antennas.list.every((a) => Number.isFinite(a.lonDeg));
    state.antennas.configured = both;

    if (both && state.floor.configured) {
      floorRenderer.rebuildFloorPointsWithLla(state);
    }

    resetSimulation();
    updateSimButtonStyles('none');
    updateButtonStates();
    redrawAll();
    setStatus(rightStatus, `天线 ${antennaId} 已配置${both ? '，穿刺点经纬高已更新' : '（A1/A2 均需配置才能推算坐标）'}`, both ? 'ok' : 'info');
  });
});

// ── 地板/天线 hover ───────────────────────────────────────────

floorCanvas.addEventListener('mousemove', (e) => {
  const rect = floorCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const sim = floorRenderer.hitTestSimPoint(x, y);
  if (sim) {
    const txt = `穿刺点: #${sim.floorPointId} | 仿真点: ${sim.simId} | 经度: ${sim.lla.lon.toFixed(7)} | 纬度: ${sim.lla.lat.toFixed(7)} | 高程: ${sim.lla.h.toFixed(3)} m`;
    showTooltip(txt, e.pageX, e.pageY);
    return;
  }

  const fp = floorRenderer.hitTestFloorPoint(x, y);
  if (fp) {
    const pt = state.floor.points.find((p) => p.id === fp.id);
    if (pt && Number.isFinite(pt.lla.lon)) {
      showTooltip(
        `编号: ${pt.id} | 经度: ${pt.lla.lon.toFixed(7)} | 纬度: ${pt.lla.lat.toFixed(7)} | 高程: ${pt.lla.h.toFixed(3)} m`,
        e.pageX, e.pageY
      );
    } else {
      showTooltip(`编号: ${fp.id} | 天线未配置，坐标待推算`, e.pageX, e.pageY);
    }
    return;
  }

  hideTooltip();
});

floorCanvas.addEventListener('mouseleave', hideTooltip);

antennaCanvas.addEventListener('mousemove', (e) => {
  const rect = antennaCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const antId = floorRenderer.hitTestAntenna(x, y);
  if (antId) {
    const ant = state.antennas.list.find((a) => a.id === antId);
    if (ant && Number.isFinite(ant.lonDeg)) {
      showTooltip(`${antId}\n经度: ${ant.lonDeg.toFixed(7)}\n纬度: ${ant.latDeg.toFixed(7)}\n高程: ${ant.hMeters.toFixed(3)} m`, e.pageX, e.pageY);
    } else {
      showTooltip(`${antId} — 点击配置`, e.pageX, e.pageY);
    }
  } else {
    hideTooltip();
  }
});

antennaCanvas.addEventListener('mouseleave', hideTooltip);

// ── 窗口缩放 ─────────────────────────────────────────────────

window.addEventListener('resize', () => {
  redrawAll();
});

// ── 初始化 ───────────────────────────────────────────────────

function init() {
  // 初始绘制（空状态）
  redrawAll();
  updateButtonStates();
  setStatus(leftStatus, '请先读取 RINEX 3.04 星历文件', 'info');
  setStatus(rightStatus, '右键地板设置尺寸；点击天线配置经纬高', 'info');
}

init();
