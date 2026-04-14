const root = document.getElementById('modalRoot');

export function openModal(contentEl) {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.appendChild(contentEl);
  root.appendChild(box);
  root.classList.add('open');
  root.addEventListener('click', (e) => {
    if (e.target === root) closeModal();
  }, { once: true });
}

export function closeModal() {
  root.classList.remove('open');
  root.innerHTML = '';
}

function row(label, inputEl) {
  const r = document.createElement('div');
  r.className = 'modal-form-row';
  const l = document.createElement('label');
  l.textContent = label;
  r.appendChild(l);
  r.appendChild(inputEl);
  return r;
}

function numberInput(id, placeholder, step = 'any', min = null) {
  const el = document.createElement('input');
  el.type = 'number';
  el.id = id;
  el.placeholder = placeholder;
  el.step = step;
  if (min !== null) el.min = min;
  return el;
}

function actions(cancelLabel, confirmLabel, onConfirm) {
  const div = document.createElement('div');
  div.className = 'modal-actions';

  const btnCancel = document.createElement('button');
  btnCancel.textContent = cancelLabel;
  btnCancel.onclick = closeModal;

  const btnOk = document.createElement('button');
  btnOk.textContent = confirmLabel;
  btnOk.className = 'primary';
  btnOk.onclick = () => onConfirm();

  div.appendChild(btnCancel);
  div.appendChild(btnOk);
  return div;
}

/**
 * 地板配置弹窗
 */
export function openFloorConfig(current, onConfirm) {
  const el = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = '设置地板尺寸';
  el.appendChild(h3);

  const lenInput = numberInput('modalLen', '如：10', 1, 1);
  lenInput.value = current.lengthM || '';
  const widInput = numberInput('modalWid', '如：8', 1, 1);
  widInput.value = current.widthM || '';

  el.appendChild(row('长度 (m，正整数)', lenInput));
  el.appendChild(row('宽度 (m，正整数)', widInput));

  el.appendChild(actions('取消', '确认', () => {
    const lenVal = parseInt(lenInput.value, 10);
    const widVal = parseInt(widInput.value, 10);
    if (!Number.isInteger(lenVal) || lenVal <= 0 || !Number.isInteger(widVal) || widVal <= 0) {
      alert('长度和宽度必须为正整数');
      return;
    }
    closeModal();
    onConfirm({ lengthM: lenVal, widthM: widVal });
  }));
  openModal(el);
}

/**
 * 天线配置弹窗
 */
export function openAntennaConfig(antennaId, state, onConfirm) {
  const ant = state.antennas.list.find((a) => a.id === antennaId);
  const el = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = `配置天线 ${antennaId}`;
  el.appendChild(h3);

  const lonInp = numberInput('antLon', '如：118.8800', 'any');
  lonInp.value = ant.lonDeg ?? '';
  const latInp = numberInput('antLat', '如：31.9500', 'any');
  latInp.value = ant.latDeg ?? '';
  const hInp = numberInput('antH', '如：20.5', 'any');
  hInp.value = ant.hMeters ?? '';
  const offInp = numberInput('antOff', '如：3.0', 'any', 0.01);
  offInp.value = state.antennas.floorOffsetM ?? '';

  el.appendChild(row('经度 (°)', lonInp));
  el.appendChild(row('纬度 (°)', latInp));
  el.appendChild(row('高程 (m, WGS84)', hInp));
  el.appendChild(row('天线离地高度 (m)', offInp));

  const note = document.createElement('p');
  note.style.cssText = 'font-size:12px;color:#8090b0;margin-top:4px;';
  note.textContent = '注：两天线高度参数共用，修改此处将同步更新。';
  el.appendChild(note);

  el.appendChild(actions('取消', '确认', () => {
    const lon = parseFloat(lonInp.value);
    const lat = parseFloat(latInp.value);
    const h = parseFloat(hInp.value);
    const off = parseFloat(offInp.value);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      alert('经度范围应在 -180 ~ 180 之间');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      alert('纬度范围应在 -90 ~ 90 之间');
      return;
    }
    if (!Number.isFinite(h)) {
      alert('高程必须为有效数值');
      return;
    }
    if (!Number.isFinite(off) || off <= 0) {
      alert('天线离地高度必须为正数');
      return;
    }
    closeModal();
    onConfirm({ antennaId, lon, lat, h, off });
  }));
  openModal(el);
}

export function openReadSuccessDialog(onConfirm) {
  const el = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = '提示';
  el.appendChild(h3);

  const p = document.createElement('p');
  p.style.color = '#d0d8ef';
  p.textContent = '星历文件读取成功';
  el.appendChild(p);

  const div = document.createElement('div');
  div.className = 'modal-actions';
  const btnOk = document.createElement('button');
  btnOk.textContent = '确认';
  btnOk.className = 'primary';
  btnOk.onclick = () => {
    closeModal();
    onConfirm();
  };
  div.appendChild(btnOk);
  el.appendChild(div);

  openModal(el);
}

/**
 * 天线选星弹窗
 */
export function openSatBinding(state, onConfirm) {
  const visible = state.satellites.visible || [];
  const el = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = '天线选星绑定';
  el.appendChild(h3);

  if (!visible.length) {
    const p = document.createElement('p');
    p.style.color = '#f5a623';
    p.textContent = '当前没有可见卫星。请先完成卫星计算。';
    el.appendChild(p);
    el.appendChild(actions('关闭', '确认', closeModal));
    openModal(el);
    return;
  }

  const table = document.createElement('table');
  table.className = 'sat-bind-table';
  table.innerHTML = `<thead><tr>
    <th>卫星</th><th>系统</th><th>高度角</th><th>绑定天线</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  const selects = new Map();

  for (const sat of visible) {
    const tr = document.createElement('tr');
    const cur = state.binding.satToAntenna.get(sat.satId) || 'NONE';
    const sel = document.createElement('select');
    sel.innerHTML = `
      <option value="A1">天线 1</option>
      <option value="A2">天线 2</option>
      <option value="NONE">不绑定</option>
    `;
    sel.value = cur;
    selects.set(sat.satId, sel);
    const td = document.createElement('td');
    td.appendChild(sel);
    tr.innerHTML = `
      <td>${sat.satId}</td>
      <td>${sat.system === 'G' ? 'GPS' : 'BDS'}</td>
      <td>${sat.elDeg.toFixed(1)}°</td>
    `;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);

  el.appendChild(actions('取消', '确认', () => {
    const bindings = new Map();
    for (const [satId, sel] of selects.entries()) {
      bindings.set(satId, sel.value);
    }
    closeModal();
    onConfirm(bindings);
  }));

  openModal(el);
}
