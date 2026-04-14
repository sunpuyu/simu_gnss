/**
 * 全局状态树（单一数据源）
 */
export const state = {
  ephemeris: {
    loaded: false,
    fileName: '',
    startTimeSec: null,
    endTimeSec: null,
    startText: '',
    endText: '',
    recordsBySat: new Map(),
    systems: { G: false, C: false }
  },
  reference: {
    lonDeg: null,
    latDeg: null,
    hMeters: null,
    refTimeText: '',
    refTimeSec: null,
    valid: false
  },
  satellites: {
    computed: false,
    all: [],
    visible: []
  },
  floor: {
    configured: false,
    lengthM: 10,
    widthM: 8,
    points: []
  },
  antennas: {
    floorOffsetM: null,
    list: [
      { id: 'A1', lonDeg: null, latDeg: null, hMeters: null },
      { id: 'A2', lonDeg: null, latDeg: null, hMeters: null }
    ],
    configured: false
  },
  binding: {
    satToAntenna: new Map()
  },
  simulation: {
    mode: 'none',
    points: [],
    lastRunTime: null
  }
};

export function resetSimulation() {
  state.simulation.mode = 'none';
  state.simulation.points = [];
  state.simulation.lastRunTime = null;
}
